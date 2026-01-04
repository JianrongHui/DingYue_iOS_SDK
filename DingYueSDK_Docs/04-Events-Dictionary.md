# 事件字典

## 通用字段（所有事件）
- event_id (uuid)
- event_name (string)
- timestamp (rfc3339)
- app_id (string)
- placement_id (string)
- variant_id (string)
- placement_version (string)
- sdk_version (string)
- app_version (string)
- rc_app_user_id (string)
- app_user_id (string, optional)
- device_id (string)
- session_id (string)
- locale (string)
- country (string, optional)
- network_type (string, optional)
- extra (object, optional, max 2kb)

## 标准可选字段
- offering_id (string)
- product_id (string)
- product_ids (array)
- price (number)
- currency (string)
- error_code (string)
- error_message (string)
- http_status (number)
- customer_info_summary (object)

## 生命周期事件
- SDK_ACTIVATED
  - extra: { "config_cache_hit": boolean, "config_ttl": number }
- SDK_CONFIG_FETCH_START
  - extra: { "url": string }
- SDK_CONFIG_FETCH_SUCCESS
  - extra: { "ttl_seconds": number, "placements_count": number }
- SDK_CONFIG_FETCH_FAIL
  - error_code, error_message

## 资源事件
- RESOURCE_DOWNLOAD_START
  - extra: { "cdn_url": string, "package_version": string }
- RESOURCE_DOWNLOAD_SUCCESS
  - extra: { "package_version": string, "download_ms": number }
- RESOURCE_DOWNLOAD_FAIL
  - error_code, http_status
- RESOURCE_CHECKSUM_FAIL
  - extra: { "expected": string, "actual": string }
- RESOURCE_UNZIP_FAIL
  - error_code

## H5 加载事件
- H5_LOAD_START
  - extra: { "entry_path": string }
- H5_LOAD_SUCCESS
  - extra: { "load_ms": number }
- H5_LOAD_FAIL
  - error_code, http_status

## 页面事件
- PAYWALL_ENTER
- PAYWALL_EXIT
- GUIDE_ENTER
- GUIDE_EXIT
- H5_CUSTOM_EVENT
  - extra: { "name": string, "params": object }

## 商品与 Offering 事件
- RC_PRODUCTS_LOAD_START
  - offering_id
- RC_PRODUCTS_LOAD_SUCCESS
  - offering_id, product_ids
- RC_PRODUCTS_LOAD_FAIL
  - offering_id, error_code

## 购买事件
- PURCHASE_START
  - product_id, offering_id
- PURCHASE_SUCCESS
  - product_id, offering_id, price, currency, customer_info_summary
- PURCHASE_FAIL
  - product_id, offering_id, error_code, error_message
- PURCHASE_CANCEL
  - product_id, offering_id

## 恢复购买事件
- RESTORE_START
  - offering_id
- RESTORE_SUCCESS
  - offering_id, customer_info_summary
- RESTORE_FAIL
  - offering_id, error_code, error_message

## customer_info_summary 示例
```json
{
  "entitlements": ["pro"],
  "active_subscriptions": ["com.app.weekly"],
  "latest_expiration": "2025-02-01T00:00:00Z",
  "is_sandbox": false,
  "original_app_user_id": "rc_123"
}
```

## 错误码约定
- NET_* 网络错误
- HTTP_* HTTP 状态错误
- ZIP_* 解压错误
- CHECKSUM_* 校验错误
- RC_* RevenueCat 错误
- H5_* H5 错误

## 错误码字典
- NET_TIMEOUT
- NET_NO_CONNECT
- HTTP_401
- HTTP_403
- HTTP_404
- HTTP_500
- ZIP_UNZIP_FAIL
- CHECKSUM_MISMATCH
- H5_ENTRY_NOT_FOUND
- H5_LOAD_TIMEOUT
- H5_BRIDGE_ERROR
- RC_PRODUCTS_NOT_FOUND
- RC_PURCHASE_CANCELLED
- RC_PURCHASE_FAILED
- RC_RESTORE_FAILED
