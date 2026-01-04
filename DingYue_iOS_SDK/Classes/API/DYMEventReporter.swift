import Foundation
import CommonCrypto

final class DYMEventReporter {
    private struct PendingEvent: Codable {
        let eventId: String
        let eventName: String
        let timestamp: String
        let sessionId: String
        let extra: String?
        let user: String?
        var retryCount: Int

        enum CodingKeys: String, CodingKey {
            case eventId = "event_id"
            case eventName = "event_name"
            case timestamp
            case sessionId = "session_id"
            case extra
            case user
            case retryCount = "retry_count"
        }
    }

    private struct PlacementInfo {
        let placementId: String
        let placementVersion: String
        let variantId: String
    }

    private static let timestampFormatter: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        return formatter
    }()

    private static let summaryFormatter: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        return formatter
    }()

    private let stateQueue = DispatchQueue(label: "com.dingyue.event.reporter")
    private let persistenceKey = "DYMSDK_Pending_Events"
    private let maxBatchSize = 20
    private let flushDelay: TimeInterval = 0.5

    private var pendingEvents: [PendingEvent] = []
    private var isSending = false
    private var flushScheduled = false
    private var retryWorkItem: DispatchWorkItem?

    init() {
        loadPersistedEvents()
        if !pendingEvents.isEmpty {
            scheduleFlush(after: 0.1)
        }
    }

    func enqueue(eventName: String, extra: String?, user: String?) {
        stateQueue.async {
            let event = PendingEvent(
                eventId: UUID().uuidString.lowercased(),
                eventName: eventName,
                timestamp: Self.timestampFormatter.string(from: Date()),
                sessionId: UserProperties.staticUuid,
                extra: extra,
                user: user,
                retryCount: 0
            )
            self.pendingEvents.append(event)
            self.persist()
            self.scheduleFlush(after: self.flushDelay)
        }
    }

    private func scheduleFlush(after delay: TimeInterval) {
        stateQueue.async {
            guard !self.flushScheduled else { return }
            self.flushScheduled = true
            self.stateQueue.asyncAfter(deadline: .now() + delay) {
                self.flushScheduled = false
                self.flushIfNeeded()
            }
        }
    }

    private func flushIfNeeded() {
        guard !isSending else { return }
        guard !pendingEvents.isEmpty else { return }

        guard isReadyForSend else {
            scheduleFlush(after: retryInterval)
            return
        }

        let batch = Array(pendingEvents.prefix(maxBatchSize))
        isSending = true

        guard let body = makeRequestBody(for: batch) else {
            handleSendResult(success: false, batchCount: batch.count)
            return
        }

        sendRequest(body: body) { [weak self] success in
            self?.stateQueue.async {
                self?.handleSendResult(success: success, batchCount: batch.count)
            }
        }
    }

    private func handleSendResult(success: Bool, batchCount: Int) {
        if success {
            retryWorkItem?.cancel()
            retryWorkItem = nil
            if batchCount <= pendingEvents.count {
                pendingEvents.removeFirst(batchCount)
            } else {
                pendingEvents.removeAll()
            }
        } else {
            incrementRetryCounts(for: batchCount)
            dropExceededRetries()
        }

        persist()
        isSending = false

        if pendingEvents.isEmpty {
            return
        }

        if success {
            flushIfNeeded()
        } else {
            scheduleRetry()
        }
    }

    private var isReadyForSend: Bool {
        return !DYMConstants.APIKeys.appId.isEmpty && !DYMConstants.APIKeys.secretKey.isEmpty
    }

    private var retryInterval: TimeInterval {
        return max(0.5, DYMConfiguration.shared.networkRequestConfig.retryInterval)
    }

    private var maxRetryCount: Int {
        return max(1, DYMConfiguration.shared.networkRequestConfig.maxRetryCount)
    }

    private func scheduleRetry() {
        guard retryWorkItem == nil else { return }
        let item = DispatchWorkItem { [weak self] in
            self?.retryWorkItem = nil
            self?.flushIfNeeded()
        }
        retryWorkItem = item
        stateQueue.asyncAfter(deadline: .now() + retryInterval, execute: item)
    }

    private func incrementRetryCounts(for count: Int) {
        guard count > 0 else { return }
        let limit = min(count, pendingEvents.count)
        for index in 0..<limit {
            pendingEvents[index].retryCount += 1
        }
    }

    private func dropExceededRetries() {
        let limit = maxRetryCount
        pendingEvents = pendingEvents.filter { $0.retryCount < limit }
    }

    private func makeRequestBody(for events: [PendingEvent]) -> Data? {
        let eventPayloads = events.map { eventPayload(for: $0) }
        let payload: [String: Any] = ["events": eventPayloads]
        return try? JSONSerialization.data(withJSONObject: payload, options: [])
    }

    private func eventPayload(for event: PendingEvent) -> [String: Any] {
        var parsedExtra = parseExtraDictionary(event.extra)
        let placementInfo = resolvePlacementInfo(extra: event.extra, user: event.user, parsedExtra: &parsedExtra)
        var payload: [String: Any] = [
            "event_id": event.eventId,
            "event_name": event.eventName,
            "timestamp": event.timestamp,
            "app_id": DYMConstants.APIKeys.appId,
            "placement_id": placementInfo.placementId,
            "variant_id": placementInfo.variantId,
            "placement_version": placementInfo.placementVersion,
            "sdk_version": UserProperties.sdkVersion,
            "app_version": UserProperties.appVersion ?? "",
            "rc_app_user_id": DYMDefaultsManager.shared.profileId,
            "device_id": UserProperties.requestUUID,
            "session_id": event.sessionId,
            "locale": UserProperties.locale
        ]

        if let country = UserProperties.area {
            payload["country"] = country
        }

        var extraObject: [String: Any]?
        if var extraDictionary = parsedExtra {
            applyStandardFields(from: &extraDictionary, to: &payload)
            extraObject = buildExtraObject(extra: event.extra, user: event.user, parsedExtra: extraDictionary)
        } else {
            extraObject = buildExtraObject(extra: event.extra, user: event.user, parsedExtra: nil)
        }

        if isFailureEvent(event.eventName) {
            if payload["error_message"] == nil {
                if parsedExtra == nil, let extra = event.extra, !extra.isEmpty {
                    payload["error_message"] = extra
                } else {
                    payload["error_message"] = event.eventName
                }
            }
            if payload["error_code"] == nil {
                payload["error_code"] = event.eventName
            }
        }

        if let extraObject = extraObject, !extraObject.isEmpty {
            payload["extra"] = extraObject
        }

        return payload
    }

    private func buildExtraObject(extra: String?, user: String?, parsedExtra: [String: Any]?) -> [String: Any]? {
        var extraObject = parsedExtra ?? [:]

        if parsedExtra == nil, let extra = extra, !extra.isEmpty {
            extraObject["raw_extra"] = extra
        }

        if let user = user, !user.isEmpty {
            extraObject["raw_user"] = user
        }

        return extraObject.isEmpty ? nil : extraObject
    }

    private func parseJSON(_ string: String) -> Any? {
        guard let data = string.data(using: .utf8) else { return nil }
        return try? JSONSerialization.jsonObject(with: data, options: [])
    }

    private func parseExtraDictionary(_ extra: String?) -> [String: Any]? {
        guard let extra = extra, !extra.isEmpty else { return nil }
        guard let parsed = parseJSON(extra) else { return nil }
        return parsed as? [String: Any]
    }

    private func applyStandardFields(from extra: inout [String: Any], to payload: inout [String: Any]) {
        if let summary = removeValue(from: &extra, keys: ["customer_info_summary", "customerInfoSummary"]) as? [String: Any] {
            payload["customer_info_summary"] = summary
        }
        if let errorCode = removeValue(from: &extra, keys: ["error_code", "errorCode"]) {
            payload["error_code"] = "\(errorCode)"
        }
        if let errorMessage = removeValue(from: &extra, keys: ["error_message", "errorMessage"]) {
            payload["error_message"] = "\(errorMessage)"
        }
        if let offeringId = removeValue(from: &extra, keys: ["offering_id", "offeringId"]) {
            payload["offering_id"] = offeringId
        }
        if let productId = removeValue(from: &extra, keys: ["product_id", "productId", "platformProductId"]) {
            payload["product_id"] = productId
        }
        if let productIds = removeValue(from: &extra, keys: ["product_ids", "productIds"]) {
            payload["product_ids"] = productIds
        }
        if let price = removeValue(from: &extra, keys: ["price", "product_price", "productPrice"]) {
            payload["price"] = price
        }
        if let currency = removeValue(from: &extra, keys: ["currency", "currencyCode"]) {
            payload["currency"] = currency
        }
        if let appUserId = removeValue(from: &extra, keys: ["app_user_id", "appUserId"]) {
            payload["app_user_id"] = appUserId
        }
        if let networkType = removeValue(from: &extra, keys: ["network_type", "networkType"]) {
            payload["network_type"] = networkType
        }
        if let httpStatus = removeValue(from: &extra, keys: ["http_status", "httpStatus"]) {
            payload["http_status"] = httpStatus
        }
    }

    private func removeValue(from dictionary: inout [String: Any], keys: [String]) -> Any? {
        for key in keys {
            if let value = dictionary.removeValue(forKey: key) {
                return value
            }
        }
        return nil
    }

    private func isFailureEvent(_ eventName: String) -> Bool {
        let uppercased = eventName.uppercased()
        return uppercased.contains("FAIL")
            || uppercased.contains("ERROR")
            || uppercased.contains("CANCEL")
            || uppercased.contains("CANCLED")
            || uppercased.contains("NOT_FOUND")
            || uppercased.contains("CHECKSUM")
    }

    private func parsePlacementIdentifier(_ identifier: String) -> (id: String, version: String)? {
        let components = identifier.split(separator: "/", maxSplits: 1).map(String.init)
        guard components.count == 2 else { return nil }
        return (components[0], components[1])
    }

    private func resolvePlacementInfo(extra: String?, user: String?, parsedExtra: inout [String: Any]?) -> PlacementInfo {
        var placementId = ""
        var placementVersion = ""
        var variantId = ""

        if var extraDictionary = parsedExtra {
            if let id = extraDictionary["placement_id"] as? String ?? extraDictionary["placementId"] as? String {
                placementId = id
                extraDictionary.removeValue(forKey: "placement_id")
                extraDictionary.removeValue(forKey: "placementId")
            }
            if let version = extraDictionary["placement_version"] as? String ?? extraDictionary["placementVersion"] as? String {
                placementVersion = version
                extraDictionary.removeValue(forKey: "placement_version")
                extraDictionary.removeValue(forKey: "placementVersion")
            }
            if let variant = extraDictionary["variant_id"] as? String ?? extraDictionary["variantId"] as? String {
                variantId = variant
                extraDictionary.removeValue(forKey: "variant_id")
                extraDictionary.removeValue(forKey: "variantId")
            }
            parsedExtra = extraDictionary
        }

        if placementId.isEmpty || placementVersion.isEmpty {
            if let extraValue = extra, let userValue = user {
                let extraIsVersion = looksLikeVersion(extraValue)
                let userIsVersion = looksLikeVersion(userValue)

                if extraIsVersion && !userIsVersion {
                    if placementId.isEmpty { placementId = userValue }
                    if placementVersion.isEmpty { placementVersion = extraValue }
                } else if userIsVersion && !extraIsVersion {
                    if placementId.isEmpty { placementId = extraValue }
                    if placementVersion.isEmpty { placementVersion = userValue }
                } else {
                    if placementId.isEmpty { placementId = userValue }
                    if placementVersion.isEmpty { placementVersion = extraValue }
                }
            } else if placementId.isEmpty, let userValue = user {
                placementId = userValue
            }
        }

        if placementId.isEmpty || placementVersion.isEmpty {
            if let cachedIdentifier = DYMDefaultsManager.shared.cachedPaywallPageIdentifier ?? DYMDefaultsManager.shared.cachedGuidePageIdentifier,
               let cached = parsePlacementIdentifier(cachedIdentifier) {
                if placementId.isEmpty { placementId = cached.id }
                if placementVersion.isEmpty { placementVersion = cached.version }
            }
        }

        if variantId.isEmpty {
            variantId = DYMDefaultsManager.shared.cachedVariationsIds[placementId] ?? ""
        }
        return PlacementInfo(placementId: placementId, placementVersion: placementVersion, variantId: variantId)
    }

    private func looksLikeVersion(_ value: String) -> Bool {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return false }
        let allowed = CharacterSet(charactersIn: "0123456789.")
        return trimmed.rangeOfCharacter(from: allowed.inverted) == nil
    }

    private func sendRequest(body: Data, completion: @escaping (Bool) -> Void) {
        let path = "/v1/sdk/events"
        let urlString = OpenAPIClientAPI.basePath + path
        guard let url = URL(string: urlString) else {
            completion(false)
            return
        }

        let timestamp = String(Int(Date().timeIntervalSince1970))
        let nonce = UUID().uuidString
        let bodyHash = sha256Hex(body)
        // Canonical string for HMAC: METHOD\nPATH\nTIMESTAMP\nNONCE\nSHA256(body)
        let canonicalString = "POST\n\(path)\n\(timestamp)\n\(nonce)\n\(bodyHash)"
        let signature = hmacSHA256Hex(key: DYMConstants.APIKeys.secretKey, message: canonicalString)

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.httpBody = body
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(DYMConstants.APIKeys.appId, forHTTPHeaderField: "X-App-Id")
        request.setValue(timestamp, forHTTPHeaderField: "X-Timestamp")
        request.setValue(nonce, forHTTPHeaderField: "X-Nonce")
        request.setValue(signature, forHTTPHeaderField: "X-Signature")

        URLSession.shared.dataTask(with: request) { _, response, error in
            let statusCode = (response as? HTTPURLResponse)?.statusCode ?? 0
            let success = error == nil && (200..<300).contains(statusCode)
            completion(success)
        }.resume()
    }

    private func sha256Hex(_ data: Data) -> String {
        var hash = [UInt8](repeating: 0, count: Int(CC_SHA256_DIGEST_LENGTH))
        data.withUnsafeBytes { buffer in
            _ = CC_SHA256(buffer.baseAddress, CC_LONG(data.count), &hash)
        }
        return hash.map { String(format: "%02x", $0) }.joined()
    }

    private func hmacSHA256Hex(key: String, message: String) -> String {
        let keyData = key.data(using: .utf8) ?? Data()
        let messageData = message.data(using: .utf8) ?? Data()
        var digest = [UInt8](repeating: 0, count: Int(CC_SHA256_DIGEST_LENGTH))
        keyData.withUnsafeBytes { keyBytes in
            messageData.withUnsafeBytes { messageBytes in
                CCHmac(
                    CCHmacAlgorithm(kCCHmacAlgSHA256),
                    keyBytes.baseAddress,
                    keyData.count,
                    messageBytes.baseAddress,
                    messageData.count,
                    &digest
                )
            }
        }
        return digest.map { String(format: "%02x", $0) }.joined()
    }

    static func customerInfoSummary(from purchaseResult: [[String: Any]]?, fallbackProduct: [String: Any]? = nil) -> [String: Any]? {
        guard purchaseResult != nil || fallbackProduct != nil else {
            return nil
        }

        if let purchaseResult = purchaseResult {
            for item in purchaseResult {
                if let summary = item["customer_info_summary"] as? [String: Any] {
                    return summary
                }
            }
        }

        var productIds: [String] = []
        var latestExpiration: Double?

        if let purchaseResult = purchaseResult {
            for item in purchaseResult {
                if let id = item["platformProductId"] as? String ?? item["product_id"] as? String ?? item["productId"] as? String {
                    if !productIds.contains(id) {
                        productIds.append(id)
                    }
                }
                if let expirationValue = item["expiresAt"] ?? item["expires_at"],
                   let seconds = expirationSeconds(from: expirationValue) {
                    if latestExpiration == nil || seconds > latestExpiration! {
                        latestExpiration = seconds
                    }
                }
            }
        }

        if productIds.isEmpty, let fallbackProduct = fallbackProduct {
            if let id = fallbackProduct["product_id"] as? String ?? fallbackProduct["productId"] as? String {
                productIds.append(id)
            }
        }

        var summary: [String: Any] = [
            "entitlements": [],
            "active_subscriptions": productIds
        ]

        if let latestExpiration = latestExpiration {
            let date = Date(timeIntervalSince1970: latestExpiration)
            summary["latest_expiration"] = summaryFormatter.string(from: date)
        }

        return summary
    }

    static func errorInfo(from error: Error?) -> [String: Any]? {
        guard let error = error else {
            return nil
        }
        if let dymError = error as? DYMError {
            let codeName = String(describing: dymError.dymCode)
            let codeValue = dymError.dymCode == .none ? "\(dymError.code)" : codeName
            return [
                "error_code": codeValue,
                "error_message": dymError.localizedDescription
            ]
        }
        let nsError = error as NSError
        return [
            "error_code": "\(nsError.domain):\(nsError.code)",
            "error_message": nsError.localizedDescription
        ]
    }

    private static func expirationSeconds(from value: Any) -> Double? {
        let raw: Double?
        if let number = value as? NSNumber {
            raw = number.doubleValue
        } else if let string = value as? String, let number = Double(string) {
            raw = number
        } else {
            raw = nil
        }
        guard let rawValue = raw else { return nil }
        if rawValue > 100_000_000_000 {
            return rawValue / 1000.0
        }
        return rawValue
    }

    private func loadPersistedEvents() {
        let defaults = UserDefaults.standard
        guard let data = defaults.data(forKey: persistenceKey) else { return }
        if let events = try? JSONDecoder().decode([PendingEvent].self, from: data) {
            pendingEvents = events
        }
    }

    private func persist() {
        let defaults = UserDefaults.standard
        if pendingEvents.isEmpty {
            defaults.removeObject(forKey: persistenceKey)
            return
        }

        if let data = try? JSONEncoder().encode(pendingEvents) {
            defaults.set(data, forKey: persistenceKey)
        }
    }
}
