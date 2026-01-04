# 数据库结构 (PostgreSQL)

```sql
create table apps (
  id uuid primary key,
  app_id text unique not null,
  app_key text not null,
  name text not null,
  env text not null, -- prod|staging
  status text not null default 'active',
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table placements (
  id uuid primary key,
  app_id text not null,
  placement_id text not null,
  type text not null, -- guide|paywall
  enabled boolean not null,
  default_variant_id uuid,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table packages (
  id uuid primary key,
  app_id text not null,
  placement_id text not null,
  version text not null,
  checksum text not null,
  entry_path text not null,
  cdn_url text not null,
  size_bytes bigint not null,
  created_at timestamptz not null
);

create table variants (
  id uuid primary key,
  app_id text not null,
  placement_id text not null,
  package_id uuid not null,
  offering_id text,
  product_ids text[], -- order preserved
  priority int not null,
  enabled boolean not null,
  page_options jsonb,
  created_at timestamptz not null
);

create table rulesets (
  id uuid primary key,
  app_id text not null,
  placement_id text not null,
  priority int not null,
  condition jsonb not null,
  variant_id uuid not null,
  experiment_id uuid,
  created_at timestamptz not null
);

create table experiments (
  id uuid primary key,
  app_id text not null,
  placement_id text not null,
  status text not null, -- draft|running|paused|ended
  traffic int not null, -- 0-100
  seed text not null,
  created_at timestamptz not null
);

create table experiment_variants (
  id uuid primary key,
  experiment_id uuid not null,
  variant_id uuid not null,
  weight int not null -- sum=100
);

create table events (
  id uuid primary key,
  app_id text not null,
  event_name text not null,
  payload jsonb not null,
  created_at timestamptz not null
);

create table analytics_sinks (
  id uuid primary key,
  app_id text not null,
  type text not null, -- ga4|firebase
  config jsonb not null,
  enabled boolean not null
);

create index idx_events_app_time on events (app_id, created_at);
create index idx_events_name on events (event_name);
create index idx_rulesets_placement on rulesets (placement_id, priority);
create index idx_variants_placement on variants (placement_id, priority);
```
