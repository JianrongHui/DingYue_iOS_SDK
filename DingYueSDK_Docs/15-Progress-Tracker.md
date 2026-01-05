# 开发进度追踪

> 用途：跨 AI/跨人员交接时快速了解"已完成/进行中/待办"。
> 更新方式：每次合并或里程碑变更后更新本文件，务必附带日期。
> 最后更新：2026-01-05

---

## 总体进度概览

| 里程碑 | 描述 | 进度 | Owner | 状态 |
|--------|------|------|-------|------|
| M1 | 后台基础能力（配置/事件/包管理） | 95% | Backend | 🟢 接近完成 |
| M2 | 管理后台（Web Admin） | 98% | Web | 🟢 接近完成 |
| M3 | SDK 改造（iOS） | 95% | iOS | 🟢 接近完成 |
| M4 | 数据与分析（GA/Firebase/数仓） | 90% | Data | 🟢 接近完成 |

---

## M1 后台基础能力 (95%)

### 已完成
- [x] 服务器骨架（Express + TypeScript）
- [x] `/healthz` 健康检查路由
- [x] `request_id` 中间件
- [x] `error_handler` 中间件
- [x] 规则引擎库（DSL 解析与命中判断）
- [x] 实验分流算法（hash + bucket）
- [x] **HMAC-SHA256 鉴权中间件** _(2025-01-04)_
- [x] **事件持久化到 D1** _(2025-01-04)_
- [x] **配置接口接入规则引擎与实验分流** _(2025-01-04)_
- [x] **包管理：manifest 校验 + checksum 计算 + CDN URL** _(2025-01-04)_
- [x] **analytics_sinks 配置管理（CRUD + 缓存）** _(2026-01-05)_
- [x] **ETL 模块（手动触发端点）** _(2026-01-05)_

### 待办（低优先级）
| 任务 | Owner | 依赖 | 对应规范 |
|------|-------|------|----------|
| D1 表结构迁移脚本 | Backend | 无 | 03-Database-Schema |
| R2 对象存储集成 | Backend | Cloudflare 资源初始化 | 02-Backend-APIs |

### 验收条件
- [x] `/v1/sdk/config` 返回有效 placement/variant
- [x] `/v1/sdk/events` 可批量入库
- [x] 包上传后可生成 CDN URL 与 checksum

---

## M2 管理后台 (98%)

### 已完成
- [x] web-admin 骨架（React + Vite + TypeScript）
- [x] 页面路由配置
- [x] 静态 mock 数据
- [x] **App 管理页面（完整 CRUD）** _(2025-01-04)_
- [x] **Placement 管理页面（完整 CRUD）** _(2025-01-04)_
- [x] **Variant 管理页面（完整 CRUD）** _(2025-01-04)_
- [x] **localStorage 持久化工具** _(2025-01-04)_
- [x] **规则可视化构建器（条件编辑/预览/测试）** _(2026-01-04)_
- [x] **实验管理页面（状态流/变体权重）** _(2026-01-04)_
- [x] **事件查询页面（筛选/漏斗分析/导出）** _(2026-01-04)_
- [x] **包上传与版本管理页面（上传/激活/回滚）** _(2026-01-04)_
- [x] **接入真实后端 API（HTTP 客户端 + Hooks）** _(2026-01-05)_
- [x] **Analytics Sinks 管理页面** _(2026-01-05)_

### 待办
| 任务 | Owner | 依赖 | 对应规范 |
|------|-------|------|----------|
| 端到端配置投放验证 | Web | 后端部署 | - |

### 验收条件
- [x] Apps/Placements/Variants 可创建、编辑、删除
- [x] 可回滚 H5 包版本
- [x] 规则预览与命中测试可用
- [ ] 可完成端到端配置投放

---

## M3 SDK 改造 (95%)

### 已完成
- [x] RevenueCat PurchaseProvider 适配
- [x] 事件队列与批量上报
- [x] ConfigProvider 配置拉取
- [x] H5 包管理（下载/解压/缓存）
- [x] Example Demo 改造
- [x] H5Samples/Paywall 示例包
- [x] H5Samples/Guide 示例包
- [x] vip_*/guide_* Bridge 兼容
- [x] **HMAC-SHA256 签名实现** _(2025-01-04)_
- [x] **完整事件字段补齐（含 customer_info_summary）** _(2025-01-04)_
- [x] **vip_page_options/guide_page_options 自动关闭控制** _(2025-01-04)_

### 待办
| 任务 | Owner | 依赖 | 对应规范 |
|------|-------|------|----------|
| 联调验证（与后端真实接口联调） | iOS | M1 完成 | - |
| manifest.json entry_path 多层目录验证 | iOS | 无 | 08-H5-Package-Spec |
| checksum 校验失败回退逻辑验证 | iOS | 无 | 08-H5-Package-Spec |

### 验收条件
- [x] HMAC 签名正确计算并携带
- [x] 事件完整上报（含 customer_info_summary）
- [x] 自动关闭控制生效
- [ ] Guide/Paywall 端到端联调通过

---

## M4 数据与分析 (90%)

### 已完成
- [x] **GA4 Measurement Protocol 事件转发** _(2025-01-04)_
- [x] **事件名称映射（SDK -> GA4）** _(2025-01-04)_
- [x] **异步转发集成（不阻塞主流程）** _(2025-01-04)_
- [x] **Firebase 事件转发** _(2026-01-04)_
- [x] **数据库迁移脚本（8 张表）** _(2026-01-04)_
- [x] **analytics_sinks 配置管理（DB + 缓存）** _(2026-01-05)_
- [x] **数仓 fact_events 表结构** _(2026-01-05)_
- [x] **ETL 管道（提取/转换/加载）** _(2026-01-05)_
- [x] **统计 SQL 模板（转化率/SKU/引导页）** _(2026-01-05)_
- [x] **汇总表迁移（agg_daily_conversion/agg_ab_experiment）** _(2026-01-05)_

### 待办
| 任务 | Owner | 依赖 | 对应规范 |
|------|-------|------|----------|
| 转化率报表集成 | Data | 部署验证 | 10-Analytics-SQL |
| 实验对比分析集成 | Data | 部署验证 | 10-Analytics-SQL |

### 验收条件
- [x] GA4 转发数据准确
- [x] Firebase 转发数据准确
- [ ] 核心漏斗可查（Paywall Enter → Purchase Success）
- [ ] 实验对比可用

---

## 风险与阻塞项

| 风险/阻塞 | 严重程度 | 状态 | 负责人 | 应对措施 |
|-----------|----------|------|--------|----------|
| RevenueCat Offering 缺失 | 🟡 中 | 监控中 | iOS | fallback to current offering + 告警 |
| H5 包体积过大影响加载 | 🟡 中 | 监控中 | Web | 限制 <=10MB，单资源 <=2MB |
| Cloudflare R2 + CDN 已确定 | 🟢 低 | 已确认 | Backend | 绑定 R2 bucket 与 CDN 域名 |
| 事件丢失风险 | 🟢 低 | 已解决 | iOS | 本地持久队列 + D1 持久化 |

---

## 并行开发执行记录

### 第一阶段（2025-01-04）
| 任务 | 分支 | 提交 | 状态 |
|------|------|------|------|
| HMAC 鉴权中间件 | feat/hmac-auth | e036779 | ✅ 已合并 |
| 事件持久化 | feat/events-persistence | 5878692 | ✅ 已合并 |
| 规则引擎接入 | feat/rules-integration | 63144e6 | ✅ 已合并 |

### 第二阶段（2025-01-04）
| 任务 | 分支 | 提交 | 状态 |
|------|------|------|------|
| 包管理完善 | feat/package-management | 63de7a1 | ✅ 已合并 |
| Web 管理后台页面 | feat/web-admin-pages | 890e568 | ✅ 已合并 |
| iOS HMAC + 事件 | feat/ios-sdk-enhancement | a1688d8 | ✅ 已合并 |
| GA4 事件转发 | feat/analytics-forwarding | 61c0f63 | ✅ 已合并 |

### 第三阶段（2026-01-04）
| 任务 | 分支 | 提交 | 状态 |
|------|------|------|------|
| 规则可视化构建器 | feat/rules-builder | ca40ea3 | ✅ 已合并 |
| 实验管理页面 | feat/experiments-page | 82d1565 | ✅ 已合并 |
| 事件查询页面 | feat/events-query | e44c0cb | ✅ 已合并 |
| 包上传与版本管理 | feat/packages-upload | 9def394 | ✅ 已合并 |
| Firebase 转发与迁移 | feat/firebase-migration | 5b64dc4 | ✅ 已合并 |

### 第四阶段（2026-01-05）
| 任务 | 分支 | 提交 | 状态 |
|------|------|------|------|
| Web 接入真实后端 API | feat/web-real-api | 20445bf | ✅ 已合并 |
| Analytics Sinks 配置管理 | feat/analytics-sinks | c837c64 | ✅ 已合并 |
| 数仓 fact_events 与 ETL | feat/data-warehouse | 27af775 | ✅ 已合并 |

---

## 更新记录

| 日期 | 变更内容 | 操作人 |
|------|----------|--------|
| 2026-01-05 | 第四阶段并行开发：Web API接入、Analytics Sinks、数仓ETL | AI 协作 |
| 2026-01-04 | 第三阶段并行开发：规则构建器、实验页面、事件查询、包上传、Firebase转发 | AI 协作 |
| 2025-01-04 | 第一阶段并行开发：HMAC鉴权、事件持久化、规则引擎接入 | AI 协作 |
| 2025-01-04 | 第二阶段并行开发：包管理、Web页面、iOS SDK、GA4转发 | AI 协作 |
| 2025-01-04 | 更新进度文档反映真实完成状态 | AI |

---

## 下一阶段待办（需联调验证）

| 任务 | 模块 | 复杂度 | 依赖 |
|------|------|--------|------|
| 端到端联调验证 | iOS + Backend | 中 | 后端部署 |
| 转化率报表集成验证 | Data | 低 | 数据积累 |
| 实验对比分析集成验证 | Data | 低 | 数据积累 |

---

## 交接给新执行者的必读

按以下顺序阅读：

1. **总览与架构**：`01-Solution-Overview.md`
2. **接口规范**：`02-Backend-APIs.md`
3. **事件字典**：`04-Events-Dictionary.md`
4. **H5 规范**：`08-H5-Package-Spec.md`
5. **OpenAPI**：`12-OpenAPI-Full.yaml`
6. **执行方案**：`14-Development-Execution-Plan.md`

### 快速检查清单
- [x] JSON 字段使用 snake_case
- [x] HMAC 签名规则（METHOD\nPATH\nTIMESTAMP\nNONCE\nSHA256(body)）
- [x] H5 包必须包含 manifest.json
- [x] Bridge 命名（vip_*/guide_*）
- [x] 事件必填字段（见 11-SDK-Event-Spec.md）
