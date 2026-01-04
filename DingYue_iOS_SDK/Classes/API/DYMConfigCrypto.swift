//
//  DYMConfigCrypto.swift
//  DingYueMobileSDK
//

import Foundation
import CommonCrypto

enum DYMConfigCrypto {
    static func sha256Hex(_ data: Data) -> String {
        var hash = [UInt8](repeating: 0, count: Int(CC_SHA256_DIGEST_LENGTH))
        data.withUnsafeBytes { buffer in
            _ = CC_SHA256(buffer.baseAddress, CC_LONG(data.count), &hash)
        }
        return hash.map { String(format: "%02x", $0) }.joined()
    }

    static func hmacSHA256Hex(key: String, data: String) -> String {
        let keyData = Data(key.utf8)
        let messageData = Data(data.utf8)
        var mac = [UInt8](repeating: 0, count: Int(CC_SHA256_DIGEST_LENGTH))
        keyData.withUnsafeBytes { keyBuffer in
            messageData.withUnsafeBytes { messageBuffer in
                CCHmac(
                    CCHmacAlgorithm(kCCHmacAlgSHA256),
                    keyBuffer.baseAddress,
                    keyData.count,
                    messageBuffer.baseAddress,
                    messageData.count,
                    &mac
                )
            }
        }
        return mac.map { String(format: "%02x", $0) }.joined()
    }
}
