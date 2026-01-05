create table experiments (
  id text primary key,
  app_id text not null,
  placement_id text not null,
  status text not null,
  traffic integer not null,
  seed text not null,
  created_at text not null
);

create table experiment_variants (
  id text primary key,
  experiment_id text not null,
  variant_id text not null,
  weight integer not null
);
