create table variants (
  id uuid primary key,
  app_id text not null,
  placement_id text not null,
  package_id uuid not null,
  offering_id text,
  product_ids text[],
  priority int not null,
  enabled boolean not null,
  page_options jsonb,
  created_at timestamptz not null
);

create index idx_variants_placement on variants (placement_id, priority);
