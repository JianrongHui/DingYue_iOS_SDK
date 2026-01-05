create table apps (
  id text primary key,
  app_id text unique not null,
  app_key text not null,
  name text not null,
  env text not null,
  status text not null default 'active',
  created_at text not null,
  updated_at text not null
);
