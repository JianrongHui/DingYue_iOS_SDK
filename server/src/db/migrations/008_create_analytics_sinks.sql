create table analytics_sinks (
  id uuid primary key,
  app_id text not null,
  type text not null,
  config jsonb not null,
  enabled boolean not null
);
