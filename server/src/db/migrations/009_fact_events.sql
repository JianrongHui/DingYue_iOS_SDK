-- 事实表：扁平化的事件数据，优化查询性能
create table fact_events (
  id text primary key,

  -- 事件标识
  event_id text not null,
  event_name text not null,
  event_ts text not null,
  event_date text not null,

  -- 应用与配置
  app_id text not null,
  placement_id text,
  variant_id text,
  placement_version text,

  -- 用户与设备
  rc_app_user_id text,
  device_id text,
  session_id text,

  -- 产品与交易
  offering_id text,
  product_id text,
  price real,
  currency text,

  -- 实验信息
  experiment_id text,
  rule_set_id text,

  -- SDK 与设备信息
  sdk_version text,
  app_version text,
  os_version text,
  device_model text,
  locale text,
  timezone text,

  -- 原始 payload（可选，用于回溯）
  payload_json text,

  -- ETL 元数据
  etl_processed_at text not null,

  unique(event_id)
);

-- 查询优化索引
create index idx_fact_events_app_date on fact_events (app_id, event_date);
create index idx_fact_events_name_date on fact_events (event_name, event_date);
create index idx_fact_events_placement on fact_events (placement_id, event_date);
create index idx_fact_events_variant on fact_events (variant_id, event_date);
create index idx_fact_events_user on fact_events (rc_app_user_id, event_date);
create index idx_fact_events_session on fact_events (session_id);
