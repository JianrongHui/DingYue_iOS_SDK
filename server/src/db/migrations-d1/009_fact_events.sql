-- Fact table: flattened events for query performance.
create table fact_events (
  id text primary key,

  -- Event identity
  event_id text not null,
  event_name text not null,
  event_ts text not null,
  event_date text not null,

  -- App and config
  app_id text not null,
  placement_id text,
  variant_id text,
  placement_version text,

  -- User and device
  rc_app_user_id text,
  device_id text,
  session_id text,

  -- Product and transaction
  offering_id text,
  product_id text,
  price real,
  currency text,

  -- Experiment info
  experiment_id text,
  rule_set_id text,

  -- SDK and device info
  sdk_version text,
  app_version text,
  os_version text,
  device_model text,
  locale text,
  timezone text,

  -- Raw payload (optional, for debugging)
  payload_json text,

  -- ETL metadata
  etl_processed_at text not null,

  unique(event_id)
);

-- Query indexes
create index idx_fact_events_app_date on fact_events (app_id, event_date);
create index idx_fact_events_name_date on fact_events (event_name, event_date);
create index idx_fact_events_placement on fact_events (placement_id, event_date);
create index idx_fact_events_variant on fact_events (variant_id, event_date);
create index idx_fact_events_user on fact_events (rc_app_user_id, event_date);
create index idx_fact_events_session on fact_events (session_id);
