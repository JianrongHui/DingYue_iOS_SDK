create table variants (
  id text primary key,
  app_id text not null,
  placement_id text not null,
  package_id text not null,
  offering_id text,
  product_ids text,
  priority integer not null,
  enabled integer not null,
  page_options text,
  created_at text not null
);

create index idx_variants_placement on variants (placement_id, priority);
