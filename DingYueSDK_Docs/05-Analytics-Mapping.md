# 分析平台事件映射 (GA4 / Firebase)

## 命名规则
- SDK 与后台 payload 使用 snake_case
- GA4/Firebase 参数使用 lowerCamelCase

## 事件名称映射
- PAYWALL_ENTER -> view_item_list
- GUIDE_ENTER -> view_promotion
- PURCHASE_START -> begin_checkout
- PURCHASE_SUCCESS -> purchase
- PURCHASE_FAIL -> purchase_error
- RESTORE_SUCCESS -> restore_purchase
- H5_CUSTOM_EVENT -> custom_event

## 参数映射 (SDK -> GA4)
- product_id -> item_id
- product_name -> item_name
- placement_id -> item_list_name
- offering_id -> item_variant
- price -> price
- currency -> currency
- placement_version -> item_list_id

## GA4 purchase 示例
```json
{
  "currency": "USD",
  "value": 4.99,
  "items": [
    {
      "item_id": "com.app.weekly",
      "item_name": "Weekly",
      "item_category": "subscription",
      "item_variant": "default",
      "price": 4.99
    }
  ]
}
```

## Firebase 说明
- Firebase 与 GA4 事件体系一致
- 后台需携带 firebase_app_instance_id 或 ga_client_id
- 自定义事件需符合 GA4 命名规范（小写+下划线）

## 转发规则
- 后台配置允许转发的 event_name 白名单
- 后台可配置 event_name -> ga_event_name 映射
- 通过 event_id 去重
