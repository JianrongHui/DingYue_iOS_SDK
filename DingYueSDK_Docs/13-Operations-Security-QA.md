# 运维、安全与测试

## 监控
- API 延迟：p50、p95、p99
- 错误率：4xx、5xx、签名失败率
- 事件链路：入库 QPS、队列积压、丢弃率
- CDN：4xx/5xx、带宽、缓存命中率
- SDK 指标：H5 加载成功率、购买成功率、RC 产品加载失败率

## 告警
- 配置拉取失败率 > 2% 且持续 5 分钟
- 事件入库丢弃率 > 1% 且持续 10 分钟
- CDN 5xx > 1% 且持续 10 分钟

## 安全
- HMAC 签名 + nonce + 时间戳防重放
- TLS 1.2+
- app_key 加密存储
- 日志脱敏，不记录收据、邮箱、姓名
- 支持按 rc_app_user_id 或 app_user_id 删除数据

## 速率限制
- /v1/sdk/config: 每设备每分钟 1 次
- /v1/sdk/events: 每设备每分钟 60 条
- 管理后台接口：每用户每分钟 60 次

## 发布与回滚
- SDK 版本采用 semver
- H5 包支持一键回滚
- Kill switch: placement.enabled=false

## QA 测试矩阵
- iOS 16/17/18
- WiFi/4G/离线/弱网
- Paywall：成功、失败、取消、恢复
- Guide：多页、继续、关闭
- H5：缺失 manifest、entry_path 不存在、checksum 不一致
- RC：offering 不存在、产品下架、价格变更
- 规则：优先级与实验分流一致性

## 迁移计划
1. 后台配置与包管理先上线
2. SDK 接入配置与 RevenueCat 适配
3. 事件链路与 GA/Firebase 转发
4. 灰度 5% -> 25% -> 100%

## 职责分工
- Backend：配置、规则、事件、转发
- Web：管理后台与 H5 包
- iOS：SDK 改造与 RC 适配
- QA：回归与支付验证
- Data：指标与报表

## 风险与应对
- Offering 缺失：回退 current offering + 告警
- H5 包过大：限制包体与资源大小
- 事件丢失：本地持久队列与重试
- 规则冲突：优先级排序 + 规则预览
