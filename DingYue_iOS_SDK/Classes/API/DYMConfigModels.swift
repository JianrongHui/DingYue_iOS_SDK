//
//  DYMConfigModels.swift
//  DingYueMobileSDK
//

import Foundation

struct DYMConfigRequest: Encodable {
    struct SDK: Encodable {
        let version: String
        let build: Int
    }

    struct App: Encodable {
        let bundleId: String
        let version: String?
        let build: String?
    }

    struct Device: Encodable {
        let osVersion: String
        let model: String
        let locale: String
        let timezone: String
        let ipCountry: String?
    }

    struct User: Encodable {
        let rcAppUserId: String?
        let appUserId: String?
        let deviceId: String?
    }

    struct Session: Encodable {
        let isFirstLaunch: Bool
        let sessionCount: Int
        let installDays: Int
    }

    struct Attributes: Encodable {
        let channel: String?
        let custom: [String: String]?
    }

    let sdk: SDK
    let app: App
    let device: Device
    let user: User
    let session: Session
    let attributes: Attributes?
}

struct DYMConfigResponse: Decodable {
    let ttlSeconds: Int?
    let placements: [DYMConfigPlacement]?
    let serverTime: String?
    let switchItems: [SwitchItem]?
    let subscribedProducts: [SubscribedObject]?
    let globalSwitchItems: [GlobalSwitch]?
    let domainName: String?
    let plistInfo: DYMPlistInfo?
}

struct DYMConfigPlacement: Decodable {
    let placementId: String
    let type: String
    let enabled: Bool?
    let variant: DYMConfigVariant?
    let ruleHit: DYMConfigRuleHit?
}

struct DYMConfigVariant: Decodable {
    let variantId: String?
    let package: DYMConfigPackage?
    let offering: DYMConfigOffering?
    let pageOptions: DYMConfigPageOptions?
}

struct DYMConfigPackage: Decodable {
    let version: String?
    let cdnUrl: String?
    let checksum: String?
    let entryPath: String?
    let sizeBytes: Int?
}

struct DYMConfigOffering: Decodable {
    let offeringId: String?
    let productIds: [String]?
    let fallbackToCurrentOffering: Bool?
}

struct DYMConfigPageOptions: Codable {
    let autoCloseOnSuccess: Bool?
    let autoCloseOnRestore: Bool?
}

extension DYMConfigPageOptions {
    var resolvedAutoCloseOnSuccess: Bool {
        return autoCloseOnSuccess ?? true
    }

    var resolvedAutoCloseOnRestore: Bool {
        return autoCloseOnRestore ?? true
    }
}

struct DYMConfigRuleHit: Decodable {
    let ruleSetId: String?
    let experimentId: String?
}

struct DYMConfigManifest: Decodable {
    let manifestVersion: Int
    let placementType: String
    let packageVersion: String
    let entryPath: String
    let checksum: String
}
