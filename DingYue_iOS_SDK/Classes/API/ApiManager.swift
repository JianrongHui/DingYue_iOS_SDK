//
//  ApiManager.swift
//  DingYueMobileSDK
//
//  Created by 靖核 on 2022/2/25.
//

import Foundation
import AnyCodable
import StoreKit

public typealias ErrorCompletion = (ErrorResponse?) -> Void
public typealias AdsCompletion = (SimpleStatusResult?,Error) -> Void
public typealias FirstReceiptCompletion = ([String:Any]?,Error?) -> Void
public typealias RecoverReceiptCompletion = ([String:Any]?,Error?) -> Void
public typealias sessionActivateCompletion = ([String:Any]?,Error?) -> Void

class ApiManager {
    var completion:sessionActivateCompletion?
    var paywallIdentifier = ""
    var paywallName = ""
    var paywallCustomize = false
    
    var guidePageIdentifier = ""
    var guidePageName = ""
    var guideCustomize = false
    var retryCount = 1
    private let configService = DYMConfigService()
    private let packageManager = DYMConfigPackageManager()

    @objc func startSession() {
        configService.fetchConfig { [weak self] result in
            guard let self = self else { return }
            switch result {
            case .failure(let error):
                DYMLogManager.logError(error)
                if self.retryCount < DYMConfiguration.shared.networkRequestConfig.maxRetryCount {
                    self.retryCount += 1
                    DispatchQueue.main.asyncAfter(deadline: DispatchTime.now() + DYMConfiguration.shared.networkRequestConfig.retryInterval) {
                        self.startSession()
                    }
                } else {
                    DYMDefaultsManager.shared.guideLoadingStatus = true
                    DYMDefaultsManager.shared.isLoadingStatus = true
                    self.completion?(nil, DYMError.failed)
                }
            case .success(let response):
                self.handleConfigResponse(response)
            }
        }
    }

    private func handleConfigResponse(_ response: DYMConfigResponse) {
        if let domainName = response.domainName, !domainName.isEmpty {
            DYMDefaultsManager.shared.cachedDomainName = domainName
        }

        if let plistInfo = response.plistInfo,
           let appId = plistInfo.appId, !appId.isEmpty,
           let apiKey = plistInfo.apiKey, !apiKey.isEmpty {
            DYMDefaultsManager.shared.cachedAppId = appId
            DYMDefaultsManager.shared.cachedApiKey = apiKey
        }

        DYMDefaultsManager.shared.cachedSwitchItems = response.switchItems
        DYMDefaultsManager.shared.cachedSubscribedObjects = response.subscribedProducts
        DYMDefaultsManager.shared.cachedGlobalSwitch = response.globalSwitchItems

        let paywallPlacement = response.placements?.first { placement in
            placement.type.lowercased() == "paywall" && (placement.enabled ?? true)
        }
        if let paywallPlacement = paywallPlacement {
            handlePaywallPlacement(paywallPlacement)
        } else {
            clearPaywallCache()
        }

        let guidePlacement = response.placements?.first { placement in
            placement.type.lowercased() == "guide" && (placement.enabled ?? true)
        }
        if let guidePlacement = guidePlacement {
            handleGuidePlacement(guidePlacement)
        } else {
            clearGuideCache()
        }

        let subscribedOjects = DYMDefaultsManager.shared.subscribedObjects(subscribedObjectArray: DYMDefaultsManager.shared.cachedSubscribedObjects)
        var results = [
            "switchs": DYMDefaultsManager.shared.cachedSwitchItems as Any,
            "subscribedOjects": subscribedOjects,
            "isUseNativePaywall": DYMDefaultsManager.shared.isUseNativePaywall,
            "isUseNativeGuide": DYMDefaultsManager.shared.isUseNativeGuide,
            "nativeGuidePageId": self.guidePageIdentifier
        ] as [String: Any]

        if DYMDefaultsManager.shared.isUseNativePaywall {
            results["nativePaywallId"] = self.paywallIdentifier
        }

        if let globalSwitchItems = DYMDefaultsManager.shared.cachedGlobalSwitch, !globalSwitchItems.isEmpty {
            results["globalSwitchItems"] = globalSwitchItems
        }

        if let products = DYMDefaultsManager.shared.cachedProducts, !products.isEmpty {
            results["cachedProducts"] = products
        }

        self.completion?(results, nil)

        if DYMobileSDK.defaultConversionValueEnabled && !DYMDefaultsManager.shared.isMultipleLaunch {
            DYMobileSDK().updateConversionValueWithDefaultRule(value: 1)
            DYMDefaultsManager.shared.isMultipleLaunch = true
        }
    }

    private func handlePaywallPlacement(_ placement: DYMConfigPlacement) {
        guard let variant = placement.variant, let package = variant.package else {
            clearPaywallCache()
            return
        }

        let placementId = placement.placementId
        let packageVersion = package.version ?? "0"
        let identifier = "\(placementId)/\(packageVersion)"
        let packageUrl = package.cdnUrl ?? ""

        let subscriptions = resolveSubscriptions(
            productIds: variant.offering?.productIds,
            fallbackToCurrent: variant.offering?.fallbackToCurrentOffering ?? false
        )
        let paywallSubscriptions = subscriptions.map { subscription in
            PaywallSubscriptions(subscriptionId: subscription.platformProductId, subscription: subscription)
        }
        let paywall = Paywall(
            name: placementId,
            version: parsePackageVersion(packageVersion),
            subscriptions: paywallSubscriptions,
            downloadUrl: packageUrl,
            customize: true
        )

        paywallIdentifier = identifier
        paywallName = placementId
        paywallCustomize = true

        if packageUrl.isEmpty {
            clearPaywallCache()
            return
        }

        if packageUrl == "local" {
            DYMDefaultsManager.shared.isUseNativePaywall = true
            DYMDefaultsManager.shared.cachedPaywallPageIdentifier = identifier
            DYMDefaultsManager.shared.cachedPaywallName = placementId
            DYMDefaultsManager.shared.cachedPaywallEntryPath = nil
            DYMDefaultsManager.shared.cachedPaywalls = [paywall]
            DYMDefaultsManager.shared.cachedProducts = subscriptions
            DYMDefaultsManager.shared.isLoadingStatus = true
            return
        }

        if hasValidCachedPaywall(identifier: identifier) {
            DYMDefaultsManager.shared.isUseNativePaywall = false
            DYMDefaultsManager.shared.cachedPaywallName = placementId
            DYMDefaultsManager.shared.isLoadingStatus = true
            return
        }

        guard let rootPath = UserProperties.paywallRootPath, let downloadUrl = URL(string: packageUrl) else {
            DYMDefaultsManager.shared.isLoadingStatus = true
            return
        }

        packageManager.downloadAndInstall(
            from: downloadUrl,
            expectedChecksum: package.checksum,
            expectedEntryPath: package.entryPath,
            expectedPackageVersion: package.version,
            to: rootPath
        ) { [weak self] result in
            guard let self = self else { return }
            switch result {
            case .success(let install):
                DYMDefaultsManager.shared.cachedPaywallEntryPath = install.entryPath
                DYMDefaultsManager.shared.cachedPaywallPageIdentifier = identifier
                DYMDefaultsManager.shared.cachedPaywallName = placementId
                DYMDefaultsManager.shared.cachedPaywalls = [paywall]
                DYMDefaultsManager.shared.cachedProducts = subscriptions
                DYMDefaultsManager.shared.isUseNativePaywall = false
            case .failure(let error):
                self.handlePackageFailure(error, placementType: "paywall")
            }
            DYMDefaultsManager.shared.isLoadingStatus = true
        }
    }

    private func handleGuidePlacement(_ placement: DYMConfigPlacement) {
        guard let variant = placement.variant, let package = variant.package else {
            clearGuideCache()
            return
        }

        let placementId = placement.placementId
        let packageVersion = package.version ?? "0"
        let identifier = "\(placementId)/\(packageVersion)"
        let packageUrl = package.cdnUrl ?? ""

        let subscriptions = resolveSubscriptions(
            productIds: variant.offering?.productIds,
            fallbackToCurrent: variant.offering?.fallbackToCurrentOffering ?? false
        )
        let guideSubscriptions = subscriptions.map { subscription in
            DYMGudieSubscriptions(subscriptionId: subscription.platformProductId, subscription: subscription)
        }

        let cachedGuide = DYMDefaultsManager.shared.cachedGuides?.first
        let purchaseSwitch = cachedGuide?.purchaseSwitch ?? false
        let swiperSize = cachedGuide?.swiperSize ?? 0

        let guide = DYMGuideObject(
            name: placementId,
            version: parsePackageVersion(packageVersion),
            subscriptions: guideSubscriptions,
            downloadUrl: packageUrl,
            customize: true,
            purchaseSwitch: purchaseSwitch,
            swiperSize: swiperSize
        )

        guidePageIdentifier = identifier
        guidePageName = placementId
        guideCustomize = true

        if packageUrl.isEmpty {
            clearGuideCache()
            return
        }

        if packageUrl == "local" {
            DYMDefaultsManager.shared.isUseNativeGuide = true
            DYMDefaultsManager.shared.cachedGuidePageIdentifier = identifier
            DYMDefaultsManager.shared.cachedGuideName = placementId
            DYMDefaultsManager.shared.cachedGuideEntryPath = nil
            DYMDefaultsManager.shared.cachedGuides = [guide]
            DYMDefaultsManager.shared.guideLoadingStatus = true
            return
        }

        if hasValidCachedGuide(identifier: identifier) {
            DYMDefaultsManager.shared.isUseNativeGuide = false
            DYMDefaultsManager.shared.cachedGuideName = placementId
            DYMDefaultsManager.shared.guideLoadingStatus = true
            return
        }

        guard let rootPath = UserProperties.guideRootPath, let downloadUrl = URL(string: packageUrl) else {
            DYMDefaultsManager.shared.guideLoadingStatus = true
            return
        }

        packageManager.downloadAndInstall(
            from: downloadUrl,
            expectedChecksum: package.checksum,
            expectedEntryPath: package.entryPath,
            expectedPackageVersion: package.version,
            to: rootPath
        ) { [weak self] result in
            guard let self = self else { return }
            switch result {
            case .success(let install):
                DYMDefaultsManager.shared.cachedGuideEntryPath = install.entryPath
                DYMDefaultsManager.shared.cachedGuidePageIdentifier = identifier
                DYMDefaultsManager.shared.cachedGuideName = placementId
                DYMDefaultsManager.shared.cachedGuides = [guide]
                DYMDefaultsManager.shared.isUseNativeGuide = false
            case .failure(let error):
                self.handlePackageFailure(error, placementType: "guide")
            }
            DYMDefaultsManager.shared.guideLoadingStatus = true
        }
    }

    private func resolveSubscriptions(productIds: [String]?, fallbackToCurrent: Bool) -> [Subscription] {
        let cached = DYMDefaultsManager.shared.cachedProducts ?? []
        let ids = productIds ?? []
        if ids.isEmpty {
            return fallbackToCurrent ? cached : []
        }
        return ids.map { productId in
            if let existing = cached.first(where: { $0.platformProductId == productId }) {
                return existing
            }
            return placeholderSubscription(for: productId)
        }
    }

    private func placeholderSubscription(for productId: String) -> Subscription {
        let currencyCode = Locale.current.currencyCode ?? "USD"
        let countryCode = Locale.current.regionCode ?? "US"
        return Subscription(
            type: Subscription.ModelType.subscription.rawValue,
            name: productId,
            platformProductId: productId,
            price: "0",
            currencyCode: currencyCode,
            countryCode: countryCode
        )
    }

    private func parsePackageVersion(_ version: String) -> Double {
        if let value = Double(version) {
            return value
        }
        let components = version.split(separator: ".")
        if components.count >= 2, let major = Double(components[0]), let minor = Double(components[1]) {
            return Double("\(major).\(minor)") ?? major
        }
        if let first = components.first, let value = Double(first) {
            return value
        }
        return 0
    }

    private func hasValidCachedPaywall(identifier: String) -> Bool {
        guard DYMDefaultsManager.shared.cachedPaywallPageIdentifier == identifier else { return false }
        if let entryPath = DYMDefaultsManager.shared.cachedPaywallEntryPath,
           FileManager.default.fileExists(atPath: entryPath) {
            return DYMDefaultsManager.shared.cachedPaywalls?.isEmpty == false
        }
        if let rootPath = UserProperties.paywallRootPath {
            let legacyEntryPath = URL(fileURLWithPath: rootPath).appendingPathComponent("index.html").path
            if FileManager.default.fileExists(atPath: legacyEntryPath) {
                DYMDefaultsManager.shared.cachedPaywallEntryPath = legacyEntryPath
                return DYMDefaultsManager.shared.cachedPaywalls?.isEmpty == false
            }
        }
        return false
    }

    private func hasValidCachedGuide(identifier: String) -> Bool {
        guard DYMDefaultsManager.shared.cachedGuidePageIdentifier == identifier else { return false }
        if let entryPath = DYMDefaultsManager.shared.cachedGuideEntryPath,
           FileManager.default.fileExists(atPath: entryPath) {
            return DYMDefaultsManager.shared.cachedGuides?.isEmpty == false
        }
        if let rootPath = UserProperties.guideRootPath {
            let legacyEntryPath = URL(fileURLWithPath: rootPath).appendingPathComponent("index.html").path
            if FileManager.default.fileExists(atPath: legacyEntryPath) {
                DYMDefaultsManager.shared.cachedGuideEntryPath = legacyEntryPath
                return DYMDefaultsManager.shared.cachedGuides?.isEmpty == false
            }
        }
        return false
    }

    private func clearPaywallCache() {
        DYMDefaultsManager.shared.cachedPaywalls = nil
        DYMDefaultsManager.shared.cachedPaywallPageIdentifier = nil
        DYMDefaultsManager.shared.cachedPaywallName = nil
        DYMDefaultsManager.shared.cachedPaywallEntryPath = nil
        DYMDefaultsManager.shared.cachedProducts = nil
        DYMDefaultsManager.shared.isUseNativePaywall = false
        DYMDefaultsManager.shared.isLoadingStatus = true
        paywallIdentifier = ""
        paywallName = ""
        paywallCustomize = false
    }

    private func clearGuideCache() {
        DYMDefaultsManager.shared.cachedGuides = nil
        DYMDefaultsManager.shared.cachedGuidePageIdentifier = nil
        DYMDefaultsManager.shared.cachedGuideName = nil
        DYMDefaultsManager.shared.cachedGuideEntryPath = nil
        DYMDefaultsManager.shared.isUseNativeGuide = false
        DYMDefaultsManager.shared.guideLoadingStatus = true
        guidePageIdentifier = ""
        guidePageName = ""
        guideCustomize = false
    }

    private func handlePackageFailure(_ error: DYMConfigPackageError, placementType: String) {
        switch error {
        case .entryNotFound, .entryPathInvalid:
            DYMEventManager.shared.track(event: "H5_ENTRY_NOT_FOUND", extra: placementType)
        case .checksumMismatch:
            DYMEventManager.shared.track(event: "RESOURCE_CHECKSUM_FAIL", extra: placementType)
        default:
            break
        }
        DYMLogManager.logError(error)
    }

    func reportIdfa(idfa:String,completion:@escaping ((SimpleStatusResult?,Error?)->())) {
        SessionsAPI.reportType(X_USER_ID: UserProperties.requestUUID, userAgent: UserProperties.userAgent, X_APP_ID: DYMConstants.APIKeys.appId, X_PLATFORM: SessionsAPI.XPLATFORM_reportType.ios, X_VERSION: UserProperties.sdkVersion, type: SessionsAPI.ModelType_reportType.idfa, body: idfa) { data, error in
            completion(data,error)
        }
    }

    func reportDeviceToken(token:String,completion:@escaping ((SimpleStatusResult?,Error?)->())) {
        SessionsAPI.reportType(X_USER_ID: UserProperties.requestUUID, userAgent: UserProperties.userAgent, X_APP_ID: DYMConstants.APIKeys.appId, X_PLATFORM: SessionsAPI.XPLATFORM_reportType.ios, X_VERSION: UserProperties.sdkVersion, type: SessionsAPI.ModelType_reportType.deviceToken, body: token) { data, error in
            completion(data,error)
        }
    }
    
    func updateSearchAdsAttribution(attribution: AnyCodable? = nil, completion:@escaping (SimpleStatusResult?,Error?) -> Void) {
        guard let attribution = attribution?.value as? DYMParams else{
            DYMLogManager.logMessage("attrition is nil")
            completion(nil,nil)
            return
        }
        let searchAtt = AppleSearchAdsAttribution(attribution: attribution)
        let appleSearchAdsRawData = DYMParamsWrapper(params: attribution)
        let appleReportObjAtt = AppleSearchAdsAttributionReportObjectAttribution(version31:searchAtt,rawData: appleSearchAdsRawData)
        let appleReportObj = AppleSearchAdsAttributionReportObject(attribution: appleReportObjAtt)
        AttributionAPI.reportSearchAdsAttr(X_USER_ID: UserProperties.requestUUID, userAgent: UserProperties.userAgent, X_APP_ID: DYMConstants.APIKeys.appId, X_PLATFORM: AttributionAPI.XPLATFORM_reportSearchAdsAttr.ios, X_VERSION: UserProperties.sdkVersion, appleSearchAdsAttributionReportObject: appleReportObj, apiResponseQueue: OpenAPIClientAPI.apiResponseQueue) { data, error in
            completion(data,error)
        }
    }

    func reportAttribution(attribution:Attribution,complete:@escaping ((SimpleStatusResult?,Error?)->())) {
        if attribution.adjustId == nil && attribution.appsFlyerId == nil && attribution.amplitudeId == nil {
            DYMLogManager.logMessage("attrition is nil")
            complete(nil,nil)
            return
        }
        AttributionAPI.attributionData(X_USER_ID: UserProperties.requestUUID, userAgent: UserProperties.userAgent, X_APP_ID: DYMConstants.APIKeys.appId, X_PLATFORM: AttributionAPI.XPLATFORM_attributionData.ios, X_VERSION: UserProperties.sdkVersion, attribution: attribution, apiResponseQueue: OpenAPIClientAPI.apiResponseQueue) { data, error in
            complete(data,error)
        }
    }
    
    func setCustomProperties(customProperties:[String:Any?]?,completion:@escaping ((SimpleStatusResult?,Error?)->())) {
        guard let properties = customProperties else {
            DYMLogManager.logMessage("properties is nil")
            completion(nil,nil)
            return
        }
        
        AttributionAPI.setCustomProperties(X_USER_ID: UserProperties.requestUUID, userAgent:  UserProperties.userAgent, X_APP_ID: DYMConstants.APIKeys.appId, X_PLATFORM: AttributionAPI.XPLATFORM_attributionData.ios, X_VERSION: UserProperties.sdkVersion, customProperties: properties, apiResponseQueue: OpenAPIClientAPI.apiResponseQueue) { data, error in
            completion(data,error)
        }
        
    }
    

    func verifySubscriptionFirst(receipt: String,for product: SKProduct?,completion:@escaping FirstReceiptCompletion) {
        guard let product = product else {
            return
        }
        let platformProductId = product.productIdentifier
        let price = product.price.stringValue
        let currency = (product.priceLocale.currencyCode)!
        let countryCode = (product.priceLocale.regionCode)!
        let receiptObj = FirstReceiptVerifyPostObject(appleReceipt: receipt, platformProductId: platformProductId, price: price, currencyCode: currency,countryCode: countryCode)
        ReceiptAPI.verifyFirstReceipt(X_USER_ID: UserProperties.requestUUID, userAgent: UserProperties.userAgent, X_APP_ID: DYMConstants.APIKeys.appId, X_PLATFORM: ReceiptAPI.XPLATFORM_verifyFirstReceipt.ios, X_VERSION: UserProperties.sdkVersion, firstReceiptVerifyPostObject: receiptObj, completion: completion)
    }

    func verifySubscriptionFirstWith(receipt: String,for product: Dictionary<String, String>?,completion:@escaping FirstReceiptCompletion) {
        guard let product = product else {
            return
        }
        let platformProductId = product["productId"]!
        let price = product["price"]!
        let currency = product["currencyCode"]!
        let countryCode = product["regionCode"]!

        let receiptObj = FirstReceiptVerifyPostObject(appleReceipt: receipt, platformProductId: platformProductId, price: price, currencyCode: currency,countryCode: countryCode)
        ReceiptAPI.verifyFirstReceipt(X_USER_ID: UserProperties.requestUUID, userAgent: UserProperties.userAgent, X_APP_ID: DYMConstants.APIKeys.appId, X_PLATFORM: ReceiptAPI.XPLATFORM_verifyFirstReceipt.ios, X_VERSION: UserProperties.sdkVersion, firstReceiptVerifyPostObject: receiptObj, completion: completion)
    }

    func verifySubscriptionRecover(receipt: String,completion:@escaping RecoverReceiptCompletion) {
        let receiptObj = ReceiptVerifyPostObject(appleReceipt: receipt)
        ReceiptAPI.verifyReceipt(X_USER_ID: UserProperties.requestUUID, userAgent: UserProperties.userAgent, X_APP_ID: DYMConstants.APIKeys.appId, X_PLATFORM: ReceiptAPI.XPLATFORM_verifyReceipt.ios, X_VERSION: UserProperties.sdkVersion, receiptVerifyPostObject: receiptObj, completion: completion)
    }
    
    func addGlobalSwitch(globalSwitch:GlobalSwitch,complete:@escaping ((SimpleStatusResult?,Error?)->())) {
        SessionsAPI.reportGlobalSwitch(X_USER_ID: UserProperties.requestUUID, userAgent: UserProperties.userAgent, X_APP_ID: DYMConstants.APIKeys.appId, X_PLATFORM: SessionsAPI.XPLATFORM_reportGlobalSwitch.ios, X_VERSION: UserProperties.sdkVersion, globalSwitch: globalSwitch) { data, error in
            complete(data,error)
        }
    }
    
    func reportConversionValue(cv:Int, coarseValue:ConversionRequest.CoarseValue? = nil) {
        let cvObject = ConversionRequest(conversionValue: cv, coarseValue: coarseValue)
        SessionsAPI.reportConversion(X_USER_ID: UserProperties.requestUUID, userAgent: UserProperties.userAgent, X_APP_ID: DYMConstants.APIKeys.appId, X_PLATFORM: SessionsAPI.XPLATFORM_reportConversion.ios, X_VERSION: UserProperties.sdkVersion, conversionRequest: cvObject) { data, error in
        }
    }
    
    func updateUserProperties() {
        var source = DYMUserSubscriptionPurchasedSourceType.DYAPICall.rawString//默认是api调用
        if let type = UserProperties.userSubscriptionPurchasedSourcesType, type == .DYPaywall {
            source = DYMUserSubscriptionPurchasedSourceType.DYPaywall.rawString
            if let paywallname = DYMDefaultsManager.shared.cachedPaywallName {
                source.append(":\(paywallname)")
            }
            if let paywallId = DYMDefaultsManager.shared.cachedPaywallPageIdentifier {
                source.append("/\(paywallId)")
            }
        } else {
            source = DYMUserSubscriptionPurchasedSourceType.DYAPICall.rawString
        }
        
        let editStringUnit = EditStringUnit(key: UserProperties.userSubscriptionPurchasedSources, value: source, type: .string)
        let editOneOf = EditOneOf.typeEditStringUnit(editStringUnit)
        
        SessionsAPI.updateUserAttribute(X_USER_ID: UserProperties.requestUUID, userAgent: UserProperties.userAgent, X_APP_ID: DYMConstants.APIKeys.appId, X_PLATFORM: SessionsAPI.XPLATFORM_updateUserAttribute.ios, X_VERSION: UserProperties.sdkVersion, editOneOf: [editOneOf]) { data, error in
            UserProperties.userSubscriptionPurchasedSourcesType = nil
        }
    }
}

//MARK: GetAppSegmentInfo
extension ApiManager {
    func getSegmentInfo(completion:@escaping((SegmentInfoResult?,Error?)->())) {
       
        AttributionAPI.getUserGroupInfo(X_USER_ID: UserProperties.requestUUID, userAgent: UserProperties.userAgent, X_APP_ID: DYMConstants.APIKeys.appId, X_PLATFORM: AttributionAPI.XPLATFORM_GroupInfoData.ios, X_VERSION: UserProperties.sdkVersion,apiResponseQueue: OpenAPIClientAPI.apiResponseQueue) { data, error in
            completion(data,error)
        }
       
    }
    
}
