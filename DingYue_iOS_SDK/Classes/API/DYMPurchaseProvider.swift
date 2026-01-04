//
//  DYMPurchaseProvider.swift
//  DingYue_iOS_SDK
//
//  Created by Codex.
//

import Foundation
import StoreKit

public protocol DYMPurchaseProvider: AnyObject {
    func purchase(productId: String, productPrice: String?, completion: @escaping DYMPurchaseCompletion)
    func purchase(product: SKProduct, completion: @escaping DYMPurchaseCompletion)
    func purchase(productId: String, productPrice: String?, quantity: Int, completion: @escaping DYMPurchaseCompletion)
    func restore(completion: @escaping DYMRestoreCompletion)
}

public extension DYMPurchaseProvider {
    func purchase(product: SKProduct, completion: @escaping DYMPurchaseCompletion) {
        purchase(productId: product.productIdentifier, productPrice: nil, completion: completion)
    }

    func purchase(productId: String, productPrice: String?, quantity: Int, completion: @escaping DYMPurchaseCompletion) {
        purchase(productId: productId, productPrice: productPrice, completion: completion)
    }
}
