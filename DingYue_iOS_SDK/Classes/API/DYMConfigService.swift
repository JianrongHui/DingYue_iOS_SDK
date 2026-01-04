//
//  DYMConfigService.swift
//  DingYueMobileSDK
//

import Foundation
#if canImport(UIKit)
import UIKit
#endif

final class DYMConfigService {
    private let session: URLSession

    init(session: URLSession = .shared) {
        self.session = session
    }

    func fetchConfig(completion: @escaping (Result<DYMConfigResponse, Error>) -> Void) {
        guard let url = URL(string: OpenAPIClientAPI.basePath + "/v1/sdk/config") else {
            completion(.failure(NSError(domain: "DYMConfigService", code: -1, userInfo: [NSLocalizedDescriptionKey: "Invalid base URL"])))
            return
        }

        let requestBody = buildRequest()
        let encoder = JSONEncoder()
        encoder.keyEncodingStrategy = .convertToSnakeCase
        let bodyData: Data
        do {
            bodyData = try encoder.encode(requestBody)
        } catch {
            completion(.failure(error))
            return
        }

        let timestamp = String(Int(Date().timeIntervalSince1970))
        let nonce = UUID().uuidString
        let bodyHash = DYMConfigCrypto.sha256Hex(bodyData)
        let canonicalString = "POST\n/v1/sdk/config\n\(timestamp)\n\(nonce)\n\(bodyHash)"
        let signature = DYMConfigCrypto.hmacSHA256Hex(key: DYMConstants.APIKeys.secretKey, data: canonicalString)

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.httpBody = bodyData
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(DYMConstants.APIKeys.appId, forHTTPHeaderField: "X-App-Id")
        request.setValue(timestamp, forHTTPHeaderField: "X-Timestamp")
        request.setValue(nonce, forHTTPHeaderField: "X-Nonce")
        request.setValue(signature, forHTTPHeaderField: "X-Signature")
        request.setValue(UserProperties.userAgent, forHTTPHeaderField: "User-Agent")

        session.dataTask(with: request) { data, response, error in
            let responseQueue = OpenAPIClientAPI.apiResponseQueue
            responseQueue.async {
                if let error = error {
                    completion(.failure(error))
                    return
                }

                guard let httpResponse = response as? HTTPURLResponse else {
                    completion(.failure(NSError(domain: "DYMConfigService", code: -2, userInfo: [NSLocalizedDescriptionKey: "Missing HTTP response"])))
                    return
                }

                guard (200...299).contains(httpResponse.statusCode) else {
                    completion(.failure(NSError(domain: "DYMConfigService", code: httpResponse.statusCode, userInfo: [NSLocalizedDescriptionKey: "Unexpected status code"])))
                    return
                }

                guard let data = data, !data.isEmpty else {
                    completion(.failure(NSError(domain: "DYMConfigService", code: -3, userInfo: [NSLocalizedDescriptionKey: "Empty response body"])))
                    return
                }

                let decoder = JSONDecoder()
                decoder.keyDecodingStrategy = .convertFromSnakeCase
                do {
                    let response = try decoder.decode(DYMConfigResponse.self, from: data)
                    completion(.success(response))
                } catch {
                    completion(.failure(error))
                }
            }
        }.resume()
    }

    private func buildRequest() -> DYMConfigRequest {
        let sessionInfo = DYMDefaultsManager.shared.recordSessionInfo()
        let appBundleId = Bundle.main.bundleIdentifier ?? ""
        let appVersion = UserProperties.appVersion
        let appBuild = UserProperties.appBuild
        let deviceId = UserProperties.idfv ?? UserProperties.requestUUID
        let customAttributes = UserProperties.extraData
        let attributes: DYMConfigRequest.Attributes?
        if customAttributes == nil {
            attributes = nil
        } else {
            attributes = DYMConfigRequest.Attributes(channel: nil, custom: customAttributes)
        }

        return DYMConfigRequest(
            sdk: DYMConfigRequest.SDK(version: UserProperties.sdkVersion, build: UserProperties.sdkVersionBuild),
            app: DYMConfigRequest.App(bundleId: appBundleId, version: appVersion, build: appBuild),
            device: DYMConfigRequest.Device(
                osVersion: currentOSVersion(),
                model: UserProperties.device,
                locale: UserProperties.locale,
                timezone: UserProperties.timezone,
                ipCountry: UserProperties.area
            ),
            user: DYMConfigRequest.User(
                rcAppUserId: nil,
                appUserId: DYMDefaultsManager.shared.profileId,
                deviceId: deviceId
            ),
            session: DYMConfigRequest.Session(
                isFirstLaunch: sessionInfo.isFirstLaunch,
                sessionCount: sessionInfo.sessionCount,
                installDays: sessionInfo.installDays
            ),
            attributes: attributes
        )
    }

    private func currentOSVersion() -> String {
        #if canImport(UIKit)
        return UIDevice.current.systemVersion
        #else
        let version = ProcessInfo.processInfo.operatingSystemVersion
        return "\(version.majorVersion).\(version.minorVersion).\(version.patchVersion)"
        #endif
    }
}
