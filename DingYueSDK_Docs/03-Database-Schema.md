# 数据库结构 (Cloudflare D1 / SQLite)

> 说明：D1 基于 SQLite，JSON 字段使用 TEXT 存储，布尔值用 0/1，时间字段使用 RFC3339 字符串。

```sql
create table apps (
  id text primary key,
  app_id text unique not null,
  app_key text not null,
  name text not null,
  env text not null, -- prod|staging
  status text not null default 'active',
  created_at text not null,
  updated_at text not null
);

create table placements (
  id text primary key,
  app_id text not null,
  placement_id text not null,
  type text not null, -- guide|paywall
  enabled integer not null, -- 0/1
  default_variant_id text,
  created_at text not null,
  updated_at text not null
);

create table packages (
  id text primary key,
  app_id text not null,
  placement_id text not null,
  version text not null,
  checksum text not null,
  entry_path text not null,
  cdn_url text not null,
  size_bytes integer not null,
  created_at text not null
);

create table variants (
  id text primary key,
  app_id text not null,
  placement_id text not null,
  package_id text not null,
  offering_id text,
  product_ids text, -- JSON array, order preserved
  priority integer not null,
  enabled integer not null, -- 0/1
  page_options text, -- JSON
  created_at text not null
);

create table rulesets (
  id text primary key,
  app_id text not null,
  placement_id text not null,
  priority integer not null,
  condition text not null, -- JSON
  variant_id text not null,
  experiment_id text,
  created_at text not null
);

create table experiments (
  id text primary key,
  app_id text not null,
  placement_id text not null,
  status text not null, -- draft|running|paused|ended
  traffic integer not null, -- 0-100
  seed text not null,
  created_at text not null
);

create table experiment_variants (
  id text primary key,
  experiment_id text not null,
  variant_id text not null,
  weight integer not null -- sum=100
);

create table events (
  id text primary key,
  app_id text not null,
  event_name text not null,
  payload text not null, -- JSON
  created_at text not null
);

create table analytics_sinks (
  id text primary key,
  app_id text not null,
  type text not null, -- ga4|firebase
  config text not null, -- JSON
  enabled integer not null -- 0/1
);

create index idx_events_app_time on events (app_id, created_at);
create index idx_events_name on events (event_name);
create index idx_rulesets_placement on rulesets (placement_id, priority);
create index idx_variants_placement on variants (placement_id, priority);
```
