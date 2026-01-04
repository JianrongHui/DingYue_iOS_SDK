# 开发进度追踪

> 用途：跨 AI/跨人员交接时快速了解“已完成/进行中/待办”。
> 更新方式：每次合并或里程碑变更后更新本文件。

## 当前进度概览

### 已完成
- 服务器骨架与基础中间件
  - server/ 项目结构（Express + TS）
  - /healthz 路由
  - request_id / error_handler 中间件
- 服务端模块（占位实现）
  - /v1/sdk/config
  - /v1/sdk/events
  - /v1/admin/packages/presign
  - /v1/admin/packages/commit
- 规则引擎库（纯函数）
  - 规则 DSL 解析与命中
  - 实验分流算法
- Web 管理后台骨架
  - web-admin/ React + Vite + TS
  - 页面路由与静态 mock 数据
- iOS SDK 改造（部分）
  - RevenueCat 购买适配
  - 事件队列与上报
  - ConfigProvider + H5 包管理
- Example Demo 改造
- H5 示例包
  - H5Samples/Paywall 与 H5Samples/Guide
- 文档体系（中文）
  - DingYueSDK_Docs/** 全套规范与执行方案

### 进行中 / 待合并
（无）

## 关键待办（高优先级）
- 服务端鉴权：HMAC 校验中间件
- 事件持久化：落库 events 表（替换内存缓冲）
- 配置接口：接入规则引擎与实验分流
- 包管理：manifest 校验 + checksum 计算 + CDN URL 生成

## 里程碑状态
- M1（配置与包管理）: 部分完成（接口占位）
- M2（管理后台）: 部分完成（骨架已完成）
- M3（SDK 改造）: 已完成（待联调验证）
- M4（数据与分析）: 待开始

## 交接给新执行者的必读
- DingYueSDK_Docs/01-Solution-Overview.md
- DingYueSDK_Docs/02-Backend-APIs.md
- DingYueSDK_Docs/04-Events-Dictionary.md
- DingYueSDK_Docs/08-H5-Package-Spec.md
- DingYueSDK_Docs/12-OpenAPI-Full.yaml
- DingYueSDK_Docs/14-Development-Execution-Plan.md

## 更新记录
- 服务器骨架与基础模块已合并到 main
- 规则引擎库已合并到 main
- 路由已在 server/src/app.ts 注册
- web-admin 骨架已合并到 main
- SDK 购买适配与事件上报已合并到 main
- SDK 配置拉取与 H5 包管理已合并到 main
- Example 与 H5Samples 已合并到 main
