//
//  RevenueCatPurchaseProvider.swift
//  DingYue_iOS_SDK
//
//  Created by Codex.
//

#if canImport(RevenueCat)
import Foundation
import StoreKit
import RevenueCat

public final class RevenueCatPurchaseProvider: DYMPurchaseProvider {
    private let purchases: Purchases
    private let iso8601Formatter = ISO8601DateFormatter()

    public init(purchases: Purchases = .shared) {
        self.purchases = purchases
    }

    public func purchase(productId: String, productPrice: String?, completion: @escaping DYMPurchaseCompletion) {
        purchases.getProducts([productId]) { [weak self] products in
            guard let self = self else { return }
            guard let storeProduct = products.first else {
                let productInfo = self.productInfo(productId: productId, productPrice: productPrice, storeProduct: nil)
                let error = DYMError(code: .noProduct, message: "RevenueCat product not found.")
                self.dispatchPurchaseCompletion(completion, receipt: nil, purchaseResult: nil, product: productInfo, error: error)
                return
            }
            self.purchase(storeProduct: storeProduct, productPrice: productPrice, completion: completion)
        }
    }

    public func restore(completion: @escaping DYMRestoreCompletion) {
        purchases.restorePurchases { [weak self] customerInfo, error in
            guard let self = self else { return }
            if let error = error {
                self.dispatchRestoreCompletion(completion, receipt: nil, purchaseResult: nil, product: nil, error: self.convertError(error, userCancelled: false))
                return
            }
            let purchaseResult = self.purchaseResult(customerInfo: customerInfo, storeProduct: nil, transaction: nil)
            self.dispatchRestoreCompletion(completion, receipt: nil, purchaseResult: purchaseResult, product: nil, error: nil)
        }
    }

    private func purchase(storeProduct: StoreProduct, productPrice: String?, completion: @escaping DYMPurchaseCompletion) {
        purchases.purchase(product: storeProduct) { [weak self] transaction, customerInfo, error, userCancelled in
            guard let self = self else { return }
            let productInfo = self.productInfo(productId: storeProduct.productIdentifier, productPrice: productPrice, storeProduct: storeProduct)
            if let error = error {
                let dymError = self.convertError(error, userCancelled: userCancelled)
                self.dispatchPurchaseCompletion(completion, receipt: nil, purchaseResult: nil, product: productInfo, error: dymError)
                return
            }
            let purchaseResult = self.purchaseResult(customerInfo: customerInfo, storeProduct: storeProduct, transaction: transaction)
            self.dispatchPurchaseCompletion(completion, receipt: nil, purchaseResult: purchaseResult, product: productInfo, error: nil)
        }
    }

    private func purchaseResult(customerInfo: CustomerInfo?, storeProduct: StoreProduct?, transaction: StoreTransaction?) -> [[String: Any]]? {
        var results: [[String: Any]] = []
        let productIds = Array(customerInfo?.activeSubscriptions ?? [])
        let fallbackProductId = storeProduct?.productIdentifier
        let targetProductIds = productIds.isEmpty ? (fallbackProductId != nil ? [fallbackProductId!] : []) : productIds
        let expirationMillis = customerInfo?.latestExpirationDate.map { Int64($0.timeIntervalSince1970 * 1000) }
        let originalTransactionId = transaction?.originalTransactionIdentifier ?? transaction?.transactionIdentifier
        let subscriptionGroupId = storeProduct?.subscriptionGroupIdentifier
        let summary = customerInfoSummary(customerInfo)

        if targetProductIds.isEmpty, let summary = summary {
            return [["customer_info_summary": summary]]
        }

        for productId in targetProductIds {
            var item: [String: Any] = ["platformProductId": productId]
            if let originalTransactionId = originalTransactionId {
                item["originalTransactionId"] = originalTransactionId
            }
            if let expirationMillis = expirationMillis {
                item["expiresAt"] = expirationMillis
            }
            if let subscriptionGroupId = subscriptionGroupId {
                item["appleSubscriptionGroupId"] = subscriptionGroupId
            }
            if let summary = summary {
                item["customer_info_summary"] = summary
            }
            results.append(item)
        }

        return results.isEmpty ? nil : results
    }

    private func customerInfoSummary(_ customerInfo: CustomerInfo?) -> [String: Any]? {
        guard let customerInfo = customerInfo else {
            return nil
        }
        var summary: [String: Any] = [:]
        summary["entitlements"] = Array(customerInfo.entitlements.active.keys)
        summary["active_subscriptions"] = Array(customerInfo.activeSubscriptions)
        if let latestExpirationDate = customerInfo.latestExpirationDate {
            summary["latest_expiration"] = iso8601Formatter.string(from: latestExpirationDate)
        }
        if let isSandbox = customerInfo.entitlements.active.values.first?.isSandbox {
            summary["is_sandbox"] = isSandbox
        }
        summary["original_app_user_id"] = customerInfo.originalAppUserId
        return summary
    }

    private func productInfo(productId: String, productPrice: String?, storeProduct: StoreProduct?) -> [String: Any] {
        let resolvedProductId = storeProduct?.productIdentifier ?? productId
        let priceValue = resolvedPriceValue(productPrice: productPrice, storeProduct: storeProduct)
        let currencyCode = storeProduct?.currencyCode ?? ""
        let salesRegion = storeProduct?.priceFormatter?.locale.regionCode ?? ""

        return [
            "productId": resolvedProductId,
            "productPrice": priceValue,
            "currency": currencyCode,
            "salesRegion": salesRegion,
            "product_id": resolvedProductId,
            "product_price": priceValue,
            "sales_region": salesRegion
        ]
    }

    private func resolvedPriceValue(productPrice: String?, storeProduct: StoreProduct?) -> Double {
        if let storeProduct = storeProduct {
            return NSDecimalNumber(decimal: storeProduct.price).doubleValue
        }
        if let productPrice = productPrice, let value = Double(productPrice) {
            return value
        }
        return 0
    }

    private func convertError(_ error: Error, userCancelled: Bool) -> DYMError {
        if userCancelled {
            return DYMError(code: .paymentCancelled, message: "User cancelled purchase.")
        }
        return DYMError(code: .failed, message: error.localizedDescription)
    }

    private func dispatchPurchaseCompletion(_ completion: @escaping DYMPurchaseCompletion, receipt: String?, purchaseResult: [[String: Any]]?, product: [String: Any]?, error: DYMError?) {
        if Thread.isMainThread {
            completion(receipt, purchaseResult, product, error)
        } else {
            DispatchQueue.main.async {
                completion(receipt, purchaseResult, product, error)
            }
        }
    }

    private func dispatchRestoreCompletion(_ completion: @escaping DYMRestoreCompletion, receipt: String?, purchaseResult: [[String: Any]]?, product: [String: Any]?, error: DYMError?) {
        if Thread.isMainThread {
            completion(receipt, purchaseResult, product, error)
        } else {
            DispatchQueue.main.async {
                completion(receipt, purchaseResult, product, error)
            }
        }
    }
}
#endif
