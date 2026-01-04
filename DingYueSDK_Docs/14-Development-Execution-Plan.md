# 开发执行方案（可交接执行）

> 目标：让任何接手的 AI 或开发者都能在不依赖对话上下文的情况下按步骤完成开发。

## 0. 关键背景与约束
- 项目根目录：仓库根目录（`DingYue_iOS_SDK`）
- SDK 源码：DingYue_iOS_SDK
- Demo：Example
- iOS 最低版本：16
- 购买与权益：RevenueCat 负责
- H5：价格来自 RevenueCat，文案与样式自由
- 事件上报：必须携带 paywall/guide 标识和 RevenueCat 上下文
- H5 自动关闭：默认关闭，H5 可禁止自动关闭

## 1. 资料入口（必须先读）
- 总览：DingYueSDK_Docs/01-Solution-Overview.md
- 接口与鉴权：DingYueSDK_Docs/02-Backend-APIs.md
- 数据库：DingYueSDK_Docs/03-Database-Schema.md
- 事件字典：DingYueSDK_Docs/04-Events-Dictionary.md
- H5 规范：DingYueSDK_Docs/08-H5-Package-Spec.md
- OpenAPI：DingYueSDK_Docs/12-OpenAPI-Full.yaml

## 2. 里程碑与交付物

### M1 后台基础能力
**交付物**
- 配置接口 /v1/sdk/config
- 事件接口 /v1/sdk/events
- 包上传与管理接口
- 规则与实验分流服务端逻辑
- PostgreSQL 表结构

**验收条件**
- config 可返回有效 placement/variant
- events 可批量入库
- 包上传后可生成 CDN URL

### M2 管理后台
**交付物**
- App/Placement/Variant/Rules/Experiment 管理页面
- 包上传与版本管理
- 事件查询页面

**验收条件**
- 可完成端到端配置投放
- 可回滚 H5 包版本

### M3 SDK 改造
**交付物**
- ConfigProvider 接入后端
- PackageManager 支持 manifest/entry_path
- RevenueCat PurchaseProvider
- 事件队列与重试上报
- H5 auto_close 控制

**验收条件**
- Guide/Paywall 可正确展示
- 购买成功走 RevenueCat
- 事件完整上报

### M4 数据与分析
**交付物**
- GA/Firebase 转发
- 统计 SQL 与报表

**验收条件**
- 核心漏斗可查
- 实验对比可用

## 3. 后台实施步骤

### 3.1 数据库
- 执行 DingYueSDK_Docs/03-Database-Schema.md
- 补充迁移工具与索引

### 3.2 配置服务
- 实现 /v1/sdk/config
- 规则引擎：读取 rulesets，按 priority 匹配
- 实验分流：hash(seed + rc_app_user_id) % 100
- 响应字段严格 snake_case

### 3.3 包管理服务
- 实现 /v1/admin/packages/presign 和 /commit
- 校验 manifest.json 与 entry_path
- 计算 checksum 并生成 cdn_url

### 3.4 事件服务
- 实现 /v1/sdk/events
- 批量入库 events 表
- 校验字段完整性与大小限制

### 3.5 分析转发
- 事件转发到 GA4/Firebase
- 使用 event_id 去重

## 4. SDK 改造步骤（iOS）

### 4.1 配置与缓存
- 替换 DingYue ApiManager
- 新建 ConfigProvider 直连自建后台
- 缓存 ttl_seconds

### 4.2 包管理
- 使用 manifest.json 的 entry_path
- 支持多级目录
- 校验 checksum，失败回退缓存包

### 4.3 RevenueCat 适配
- 提供 PurchaseProvider 协议
- 获取 offering 与 products
- purchase/restore 统一回调

### 4.4 H5 Bridge
- 保持 vip_* / guide_* 兼容
- 支持 vip_page_options/guide_page_options 控制自动关闭

### 4.5 事件上报
- 实现 EventReporter 队列
- batch size 与重试
- 字段遵循 04-Events-Dictionary

## 5. H5 开发步骤
- 规范遵循 08-H5-Package-Spec
- 必含 manifest.json
- entry_path 支持多层目录
- 只显示 RevenueCat 下发的价格

## 6. QA 测试清单
- iOS 16/17/18
- 网络：WiFi/4G/离线
- Paywall：成功、失败、取消、恢复
- Guide：多页、继续、关闭
- H5：缺 manifest、entry_path 错、checksum 错
- RC：offering 不存在、产品下架
- 规则：优先级、实验分流一致性

## 7. 交接清单
- 阅读 DingYueSDK_Docs 全部文档
- 确认 snake_case 字段与 HMAC 规则
- 确认 H5 包结构与 bridge
- 按里程碑执行并记录变更

## 8. 定义完成（DoD）
- 配置接口和事件接口均可稳定使用
- SDK Guide/Paywall 全流程正常
- GA/Firebase 转发数据准确
- 管理后台可完成投放与回滚

## 9. 可能风险
- Offering 失效：fallback current offering
- H5 包过大：限制包大小并监控
- 事件丢失：本地队列 + 重试
- 规则冲突：priority + 规则预览
