# 数仓模型

## 核心事实表
- fact_events
  - event_id
  - event_name
  - app_id
  - placement_id
  - variant_id
  - product_id
  - offering_id
  - user_id
  - session_id
  - ts
  - payload_json

## 维度表
- dim_app
- dim_user
- dim_device
- dim_placement
- dim_variant
- dim_product
- dim_offering
- dim_time
- dim_geo

## 汇总表
- agg_daily_conversion
- agg_daily_revenue
- agg_ab_experiment
- agg_event_funnel

## 分区与保留
- fact_events 按天分区
- 按 app_id 与 event_name 聚簇
- raw_events 保留 30-90 天
- fact_events 保留 12 个月
- aggregates 保留 24 个月

## ETL 流程
- Ingest: HTTP -> raw_events
- Validate: 签名、字段、大小
- Normalize: 默认字段与 snake_case
- Enrich: 关联维度、补齐地理与设备
- Aggregate: 生成日级与实验统计
