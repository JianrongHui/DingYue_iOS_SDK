create table experiments (
  id uuid primary key,
  app_id text not null,
  placement_id text not null,
  status text not null,
  traffic int not null,
  seed text not null,
  created_at timestamptz not null
);

create table experiment_variants (
  id uuid primary key,
  experiment_id uuid not null,
  variant_id uuid not null,
  weight int not null
);
