create table placements (
  id text primary key,
  app_id text not null,
  placement_id text not null,
  type text not null,
  enabled integer not null,
  default_variant_id text,
  created_at text not null,
  updated_at text not null
);
