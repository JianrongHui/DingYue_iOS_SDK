# DingYue SDK 私有化仓库

本仓库同时包含 iOS SDK 与私有化部署所需的服务端（Cloudflare Workers）和管理后台（Web Admin）。

## 生产域名

- API： https://configapi.calmwaveapp.com
- 管理后台： https://configadmin.calmwaveapp.com

## 目录结构

- DingYue_iOS_SDK/ - iOS SDK 源码（ObjC/Swift + 资源 + xcframework）
- server/ - Cloudflare Workers API（Hono + D1 + R2 + KV）
- web-admin/ - 管理后台（React + Vite）
- Example/ - iOS 示例工程
- H5Samples/ - H5 资源示例包
- DingYueSDK_Docs/ - 迁移与进度文档
- TODO-Cloudflare-Deploy.md - 部署待办与检查清单

## SDK 功能

- 配置拉取与缓存（/v1/sdk/config），按 ttl_seconds 更新
- H5 包下载/解压/校验/缓存，支持 Guide/Paywall
- WKWebView 容器展示 + JS Bridge（vip_*/guide_* 与自定义事件）
- RevenueCat 购买/恢复接入，支持 offering_id/product_ids 选择
- 事件采集与批量上报（队列+重试），字段规范化
- page_options 控制购买/恢复后的自动关闭行为

## 管理后台功能

- App 管理：创建/禁用、app_id/app_key 管理
- 包管理：上传 zip、manifest 预览、checksum 校验、版本回滚
- Placement 管理：启用/禁用、默认变体设置
- Variant 管理：绑定包、offering/product_ids、page_options 配置
- 规则与分群：可视化构建器、优先级排序、命中测试
- 实验管理：流量/seed/权重配置，启动/暂停/结束
- 事件与分析：事件查询、漏斗分析、CSV 导出
- 分析平台接入：GA4/Firebase 配置与转发状态

## 依赖要求

- Node.js 18+
- Cloudflare Wrangler CLI
- Xcode 14+ 与 CocoaPods（iOS SDK 使用时）

## 本地开发

### 服务端（Cloudflare Workers API）

```bash
cd server
npm install

# 本地 D1 迁移
wrangler d1 migrations apply dingyue-sdk --local

# 启动本地 Worker
wrangler dev --local --persist
```

绑定配置位于 `server/wrangler.toml`：
- D1 数据库：DB
- R2 存储桶：R2
- KV：NONCE_CACHE

环境变量（非敏感）在 `[vars]` 下：
- CORS_ALLOWED_ORIGINS=https://configadmin.calmwaveapp.com
- CDN_BASE_URL=https://<r2-public-base>（可选）

Secrets 使用 Wrangler 注入：
- GA4_MEASUREMENT_ID, GA4_API_SECRET（可选）
- FIREBASE_APP_ID, FIREBASE_API_SECRET, FIREBASE_ENABLED（可选）

### 管理后台（Web Admin）

```bash
cd web-admin
npm install
VITE_API_BASE_URL=http://127.0.0.1:8787 npm run dev
```

构建并发布到 Pages：

```bash
VITE_API_BASE_URL=https://configapi.calmwaveapp.com npm run build
wrangler pages deploy dist --project-name dingyue-sdk-admin --commit-dirty=true
```

### iOS SDK

CocoaPods 安装：

```ruby
pod 'DingYue_iOS_SDK'
```

本地引用（同仓库开发时）：

```ruby
pod 'DingYue_iOS_SDK', :path => '.'
```

示例工程见 `Example/`。

### iOS 详细接入示例

#### 1) 添加 `DingYue.plist`

放到 App 的 main bundle，包含 `DINGYUE_APP_ID` 与 `DINGYUE_API_KEY`：

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>DINGYUE_APP_ID</key>
  <string>app_xxxxxxxx</string>
  <key>DINGYUE_API_KEY</key>
  <string>key_xxxxxxxxx</string>
</dict>
</plist>
```

#### 2) App 启动时初始化

```swift
import DingYue_iOS_SDK

// 绑定私有化 API 域名
DYMobileSDK.enableAutoDomain = false
DYMobileSDK.basePath = "https://configapi.calmwaveapp.com"

// 可选：设置自定义 UUID
// DYMobileSDK.UUID = UUID().uuidString

// 可选：接入 RevenueCat 作为购买实现
// DYMobileSDK.purchaseProvider = RevenueCatPurchaseProvider()

// 可选：配置重试与展示样式
DYMConfiguration.shared.networkRequestConfig.maxRetryCount = 5
DYMConfiguration.shared.networkRequestConfig.retryInterval = 2
DYMConfiguration.shared.paywallConfig.presentationStyle = .bottomSheetFullScreen

DYMobileSDK.activate { result, error in
  if let error = error {
    print("DingYue activate error: \\(error)")
    return
  }
  // result 中包含配置回包信息（如已订阅信息、nativeGuidePageId 等）
}
```

#### 3) 展示 Paywall / Guide

Paywall（内购页）：

```swift
import UIKit
import DingYue_iOS_SDK

class PaywallHostVC: UIViewController, DYMPayWallActionDelegate {
  func showPaywall() {
    let extra: [String: Any] = [
      "placement_id": "paywall_main",
      "placement_version": "1.0.0",
      "variant_id": "var_001"
    ]

    DYMobileSDK.showVisualPaywall(rootController: self, extras: extra) { _, _, _, error in
      if let error = error {
        print("purchase failed: \\(error)")
      }
    }
  }
}
```

Guide（引导页）：

```swift
import UIKit
import DingYue_iOS_SDK

class AppDelegate: UIResponder, UIApplicationDelegate, DYMWindowManaging, DYMGuideActionDelegate {
  var window: UIWindow?

  func showGuide() {
    let extra: [String: Any] = [
      "placement_id": "guide_onboarding",
      "placement_version": "1.0.0",
      "variant_id": "var_002"
    ]
    DYMobileSDK.showVisualGuide(rootDelegate: self, extras: extra) { _, _, _, error in
      if let error = error {
        print("guide error: \\(error)")
      }
    }
  }
}
```

#### 4) 事件上报

`extra` 使用 JSON 字符串（snake_case）：

```swift
let extraPayload: [String: Any] = [
  "placement_id": "paywall_main",
  "placement_version": "1.0.0",
  "variant_id": "var_001",
  "product_id": "com.app.weekly",
  "price": 4.99,
  "currency": "USD"
]

let data = try? JSONSerialization.data(withJSONObject: extraPayload, options: [])
let extraString = data.flatMap { String(data: $0, encoding: .utf8) }
DYMobileSDK.track(event: "PURCHASE_SUCCESS", extra: extraString)
```

事件字段规范与事件名请参考：
- `DingYueSDK_Docs/04-Events-Dictionary.md`
- `DingYueSDK_Docs/11-SDK-Event-Spec.md`

#### 5) 可选能力

```swift
// 设置用户自定义属性（用于分群/规则）
DYMobileSDK.setCustomPropertiesWith([
  "vip_level": "gold",
  "region": "CN"
] as NSDictionary) { _, _ in }

// 获取分群结果
DYMobileSDK.getSegmentInfo { result, error in
  print(result ?? "no segment")
}

// 使用本地包作为兜底
DYMobileSDK.loadNativePaywall(paywallFullPath: filePath, basePath: folderPath)
DYMobileSDK.loadNativeGuidePage(paywallFullPath: filePath, basePath: folderPath)
```

#### 6) RevenueCat 接入示例

首先接入 RevenueCat SDK（示例为 CocoaPods）：

```ruby
pod 'RevenueCat'
```

初始化 RevenueCat 并注入到 DingYue SDK（建议在 `activate` 之前设置）：

```swift
import RevenueCat
import DingYue_iOS_SDK

Purchases.configure(withAPIKey: "<your_revenuecat_api_key>")
DYMobileSDK.purchaseProvider = RevenueCatPurchaseProvider()

DYMobileSDK.activate { result, error in
  // ...
}
```

如果你使用的是 StoreKit 2，也可以按需开启：

```swift
DYMobileSDK.shouldUseStoreKit2 = true
```

### 服务端 API 调用示例（curl）

#### 1) 健康检查

```bash
curl -sS https://configapi.calmwaveapp.com/healthz
```

#### 2) /v1/sdk/config（HMAC）

```bash
APP_ID="app_xxxxxxxx"
APP_KEY="key_xxxxxxxxx"
API_BASE="https://configapi.calmwaveapp.com"
PATH="/v1/sdk/config"
BODY='{"sdk":{"version":"0.3.16","build":1},"app":{"bundle_id":"com.example.app","version":"1.0.0","build":"1"},"device":{"os_version":"17.0","model":"iPhone","locale":"zh-Hans-CN","timezone":"Asia/Shanghai"},"user":{"rc_app_user_id":null,"app_user_id":"user_001","device_id":"device_001"},"session":{"is_first_launch":false,"session_count":3,"install_days":10},"attributes":{"channel":"appstore","custom":{"vip_level":"gold"}}}'

TS="$(date +%s)"
NONCE="$(uuidgen | tr 'A-Z' 'a-z')"
BODY_HASH="$(printf '%s' "$BODY" | openssl dgst -sha256 -binary | xxd -p -c 256)"
CANONICAL="$(printf "POST\n%s\n%s\n%s\n%s" "$PATH" "$TS" "$NONCE" "$BODY_HASH")"
SIGNATURE="$(printf '%s' "$CANONICAL" | openssl dgst -sha256 -hmac "$APP_KEY" -binary | xxd -p -c 256)"

curl -sS -X POST "$API_BASE$PATH" \
  -H "Content-Type: application/json" \
  -H "X-App-Id: $APP_ID" \
  -H "X-Timestamp: $TS" \
  -H "X-Nonce: $NONCE" \
  -H "X-Signature: $SIGNATURE" \
  --data "$BODY"
```

#### 3) /v1/sdk/events（HMAC）

```bash
APP_ID="app_xxxxxxxx"
APP_KEY="key_xxxxxxxxx"
API_BASE="https://configapi.calmwaveapp.com"
PATH="/v1/sdk/events"
BODY='{"events":[{"event_id":"evt_001","event_name":"PURCHASE_SUCCESS","timestamp":"2025-01-01T00:00:00Z","app_id":"app_xxxxxxxx","placement_id":"paywall_main","variant_id":"var_001","placement_version":"1.0.0","sdk_version":"0.3.16","app_version":"1.0.0","rc_app_user_id":"rc_001","device_id":"device_001","session_id":"sess_001","locale":"zh-Hans-CN","product_id":"com.app.weekly","price":4.99,"currency":"USD"}]}'

TS="$(date +%s)"
NONCE="$(uuidgen | tr 'A-Z' 'a-z')"
BODY_HASH="$(printf '%s' "$BODY" | openssl dgst -sha256 -binary | xxd -p -c 256)"
CANONICAL="$(printf "POST\n%s\n%s\n%s\n%s" "$PATH" "$TS" "$NONCE" "$BODY_HASH")"
SIGNATURE="$(printf '%s' "$CANONICAL" | openssl dgst -sha256 -hmac "$APP_KEY" -binary | xxd -p -c 256)"

curl -sS -X POST "$API_BASE$PATH" \
  -H "Content-Type: application/json" \
  -H "X-App-Id: $APP_ID" \
  -H "X-Timestamp: $TS" \
  -H "X-Nonce: $NONCE" \
  -H "X-Signature: $SIGNATURE" \
  --data "$BODY"
```

#### 4) 管理后台 API（无需 HMAC）

```bash
# 列出应用
curl -sS https://configapi.calmwaveapp.com/v1/admin/apps

# 创建应用
curl -sS -X POST https://configapi.calmwaveapp.com/v1/admin/apps \
  -H "Content-Type: application/json" \
  --data '{"name":"Calmwave iOS","env":"prod"}'
```

说明：/v1/sdk/* 需要 HMAC 签名，时间窗口为 ±5 分钟，nonce 10 分钟内不可复用。

## 部署命令

- Worker：`cd server && wrangler deploy`
- Pages：`cd web-admin && npm run build && wrangler pages deploy dist --project-name dingyue-sdk-admin --commit-dirty=true`

## 文档索引

- Cloudflare 迁移方案：`DingYueSDK_Docs/17-Cloudflare-Migration-Plan.md`
- 进度追踪：`DingYueSDK_Docs/15-Progress-Tracker.md`
- 交接说明：`16-AI-Handover-Guide.md`
