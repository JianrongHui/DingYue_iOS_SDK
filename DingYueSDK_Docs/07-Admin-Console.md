# 管理后台页面与功能

## App 管理
- 应用列表：名称、环境、状态、创建时间
- 应用详情：app_id、app_key、SDK Key 下载
- 操作：创建、禁用、重置 app_key

## 包管理
- 上传 zip
- 预览 manifest.json 与 entry_path
- 自动计算 checksum
- 版本列表与回滚

## Placement 管理
- placement 列表
- 启用/禁用
- 设置默认 variant
- 预览当前包

## Variant 管理
- 绑定 package_id
- 配置 offering_id 与 product_ids 顺序
- 配置 page_options
- 启用/禁用

## 规则与分群
- 可视化规则构建器（all/any）
- 字段类型校验、semver 校验
- 优先级拖拽排序
- 规则预览与命中测试

## 实验管理
- 创建实验：流量、seed、variants 权重
- 运行/暂停/结束
- 实验效果分析

## 事件与分析
- 按时间、事件名、placement 查询
- 漏斗分析
- 导出 CSV

## 分析平台接入
- 配置 GA4/Firebase
- 事件映射配置
- 转发状态与失败日志
