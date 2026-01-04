# 后端接口

## 规范
- Base URL: https://api.yourdomain.com
- Content-Type: application/json
- 响应为直接 JSON 对象，不使用统一 envelope
- 时间格式统一为 RFC3339 UTC
- SDK 与后台字段使用 snake_case
- API 部署在 Cloudflare Workers，域名由 Cloudflare 统一接入与防护

## 鉴权 (HMAC-SHA256)
必须包含以下 header：
- X-App-Id
- X-Timestamp
- X-Nonce
- X-Signature

Canonical string：
```
METHOD\nPATH\nTIMESTAMP\nNONCE\nSHA256(body)
```
Signature：
```
hex(HMAC(app_key, canonical_string))
```
时间窗口：±5 分钟，nonce 10 分钟内不可复用。

## SDK 配置接口
Endpoint: POST /v1/sdk/config

Request 示例：
```json
{
  "sdk": { "version": "1.0.0", "build": 100 },
  "app": { "bundle_id": "com.app", "version": "2.3.1", "build": "231" },
  "device": {
    "os_version": "17.2",
    "model": "iPhone15,3",
    "locale": "zh-Hans-CN",
    "timezone": "Asia/Shanghai",
    "ip_country": "CN"
  },
  "user": {
    "rc_app_user_id": "rc_123",
    "app_user_id": "u_456",
    "device_id": "idfv_xxx"
  },
  "session": {
    "is_first_launch": false,
    "session_count": 5,
    "install_days": 12
  },
  "attributes": {
    "channel": "appstore",
    "custom": { "vip_source": "ad_foo" }
  }
}
```

Response 示例：
```json
{
  "ttl_seconds": 3600,
  "placements": [
    {
      "placement_id": "paywall_main",
      "type": "paywall",
      "enabled": true,
      "variant": {
        "variant_id": "v_2025_01",
        "package": {
          "version": "2.1.0",
          "cdn_url": "https://cdn.your.com/paywall_2_1_0.zip",
          "checksum": "sha256:...",
          "entry_path": "dist/index.html",
          "size_bytes": 1234567
        },
        "offering": {
          "offering_id": "default",
          "product_ids": ["com.app.weekly", "com.app.yearly"],
          "fallback_to_current_offering": true
        },
        "page_options": {
          "auto_close_on_success": true,
          "auto_close_on_restore": true
        }
      },
      "rule_hit": { "rule_set_id": "rule_us_new", "experiment_id": "exp_q1" }
    }
  ],
  "server_time": "2025-01-01T00:00:00Z"
}
```

## SDK 事件接口
Endpoint: POST /v1/sdk/events

Request 示例：
```json
{
  "events": [
    {
      "event_id": "uuid",
      "event_name": "PURCHASE_SUCCESS",
      "timestamp": "2025-01-01T00:00:05Z",
      "app_id": "app_x",
      "placement_id": "paywall_main",
      "placement_version": "2.1.0",
      "variant_id": "v_2025_01",
      "offering_id": "default",
      "product_id": "com.app.weekly",
      "price": 4.99,
      "currency": "USD",
      "rc_app_user_id": "rc_123",
      "device_id": "idfv_xxx",
      "session_id": "s_789",
      "customer_info_summary": {
        "entitlements": ["pro"],
        "active_subscriptions": ["com.app.weekly"],
        "latest_expiration": "2025-02-01T00:00:00Z"
      },
      "extra": { "h5_version": "2.1.0" }
    }
  ]
}
```

## 管理后台接口摘要
- Apps:
  - GET /v1/admin/apps
  - POST /v1/admin/apps
  - PATCH /v1/admin/apps/{app_id}
- Placements:
  - GET /v1/admin/placements?app_id=...
  - POST /v1/admin/placements
  - PATCH /v1/admin/placements/{placement_id}
- Packages:
  - POST /v1/admin/packages/presign
  - POST /v1/admin/packages/commit
- Variants:
  - GET /v1/admin/variants?app_id=...&placement_id=...
  - POST /v1/admin/variants
  - PATCH /v1/admin/variants/{variant_id}
- Rulesets:
  - GET /v1/admin/rulesets?app_id=...&placement_id=...
  - POST /v1/admin/rulesets
  - PATCH /v1/admin/rulesets/{rule_set_id}
- Experiments:
  - GET /v1/admin/experiments?app_id=...&placement_id=...
  - POST /v1/admin/experiments
  - PATCH /v1/admin/experiments/{experiment_id}
- Events:
  - GET /v1/admin/events?app_id=...&from=...&to=...

## 包上传流程
1. 管理后台请求 /v1/admin/packages/presign
2. 前端上传 zip 到对象存储（Cloudflare R2，S3 兼容 presign）
3. 前端调用 /v1/admin/packages/commit
4. 服务端解析 manifest.json 和 entry_path
5. 服务端计算 checksum 并生成 Cloudflare CDN 地址
6. 包可绑定到 variant
