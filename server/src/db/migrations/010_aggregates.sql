-- 日级转化率汇总
create table agg_daily_conversion (
  id text primary key,
  app_id text not null,
  event_date text not null,
  placement_id text not null,
  variant_id text,
  enter_count integer not null,
  purchase_count integer not null,
  conversion_rate real not null,
  revenue real,
  currency text,
  updated_at text not null,
  unique(app_id, event_date, placement_id, variant_id)
);

-- A/B 实验对比汇总
create table agg_ab_experiment (
  id text primary key,
  app_id text not null,
  experiment_id text not null,
  variant_id text not null,
  event_date text not null,
  unique_users integer not null,
  enter_count integer not null,
  purchase_count integer not null,
  conversion_rate real not null,
  updated_at text not null,
  unique(experiment_id, variant_id, event_date)
);

create index idx_agg_conversion_lookup on agg_daily_conversion (app_id, event_date);
create index idx_agg_experiment_lookup on agg_ab_experiment (experiment_id, event_date);
