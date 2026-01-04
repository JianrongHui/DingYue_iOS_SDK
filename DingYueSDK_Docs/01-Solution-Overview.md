# 方案总览

## 目标与约束
- 保留 DingYueSDK 的 H5 下载、解压、缓存与 WKWebView 渲染能力
- 替换 DingYue 后台，使用自建后台与管理系统
- 购买与权益校验由 RevenueCat 负责
- H5 页面可完全自定义，但价格必须来自 RevenueCat
- iOS 最低版本为 16
- 需要完整事件上报，包含 paywall/guide 标识与 RevenueCat 上下文

## 范围
- SDK 负责：配置拉取、H5 包管理、WKWebView 展示、JS Bridge、RevenueCat 购买、事件上报
- 后台负责：配置下发、规则与实验、包管理、事件收集与转发、统计与分析

## 关键决策
- SDK 与后台的 JSON 字段使用 snake_case
- 继续使用现有 DingYue H5 的 bridge 命名（vip_* 与 guide_*）
- 购买成功默认关闭页面，但 H5 可关闭自动关闭
- 分群与实验分流由服务端完成
- 部署：API 使用 Cloudflare Workers；数据库使用 D1；H5 包存储于 R2 并通过 Cloudflare CDN 分发；管理后台使用 Cloudflare Pages

## 架构
- SDK
  - ConfigProvider（配置拉取）
  - PackageManager（下载、解压、校验、缓存）
  - WebViewContainer（Guide/Paywall）
  - JSBridge（H5 事件与购买触发）
  - PurchaseProvider（RevenueCat 适配）
  - EventReporter（队列、重试）
- 后台
  - 配置接口与规则引擎（Cloudflare Workers）
  - 包管理与 CDN 发布（R2 + Cloudflare CDN）
  - 事件收集与 GA/Firebase 转发
  - 管理后台与统计报表（Cloudflare Pages）

## 核心流程

### 配置拉取
1. SDK 调用 /v1/sdk/config 发送设备与用户上下文
2. 后台命中规则并返回匹配的 placement 与 variant
3. SDK 缓存配置直到 ttl_seconds 过期

### 引导页展示
1. 检查 guide placement 是否启用
2. 使用缓存包或从 CDN 下载 H5 包
3. 加载 entry_path 到 WKWebView
4. 注入 products 与 page_options
5. 处理 guide_* bridge 事件

### 支付页展示
1. 检查 paywall placement 是否启用
2. 使用缓存包或从 CDN 下载 H5 包
3. 从 RevenueCat 获取产品与价格
4. 注入 products 与 page_options
5. 处理 vip_* bridge 事件

### 购买
1. H5 发送 vip_purchase 或 guide_purchase
2. SDK 调用 RevenueCat 购买
3. 上报 PURCHASE_SUCCESS 或 PURCHASE_FAIL
4. 默认关闭页面，除非 H5 关闭自动关闭

### 事件上报
1. SDK 事件写入本地队列
2. 批量发送到 /v1/sdk/events
3. 后台转发到 GA/Firebase

## SKU 选择规则
- 优先使用配置中的 offering_id
- 若配置 product_ids，按顺序过滤并保持顺序
- offering 不存在时回退到 current offering
- 无可用 SKU 时隐藏价格并上报 RC_PRODUCTS_LOAD_FAIL

## 缓存与降级
- 配置缓存以 ttl_seconds 为准
- 每个 placement 最多保留 3 个版本包
- 下载失败回退缓存包或默认本地包
- entry_path 缺失时触发 H5_ENTRY_NOT_FOUND 并降级

## 里程碑
- M1：配置接口与包管理
- M2：SDK 接入配置与 RevenueCat 购买
- M3：事件链路与 GA/Firebase 转发
- M4：分群投放与实验分析
