create table events (
  id uuid primary key,
  app_id text not null,
  event_name text not null,
  payload jsonb not null,
  created_at timestamptz not null
);

create index idx_events_app_time on events (app_id, created_at);
create index idx_events_name on events (event_name);
