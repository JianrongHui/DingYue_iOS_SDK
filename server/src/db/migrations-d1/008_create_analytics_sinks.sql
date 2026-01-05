create table analytics_sinks (
  id text primary key,
  app_id text not null,
  type text not null,
  config text not null,
  enabled integer not null,
  created_at text not null,
  updated_at text not null
);
