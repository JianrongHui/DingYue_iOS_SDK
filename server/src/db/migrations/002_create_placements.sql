create table placements (
  id uuid primary key,
  app_id text not null,
  placement_id text not null,
  type text not null,
  enabled boolean not null,
  default_variant_id uuid,
  created_at timestamptz not null,
  updated_at timestamptz not null
);
