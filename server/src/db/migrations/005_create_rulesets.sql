create table rulesets (
  id uuid primary key,
  app_id text not null,
  placement_id text not null,
  priority int not null,
  condition jsonb not null,
  variant_id uuid not null,
  experiment_id uuid,
  created_at timestamptz not null
);

create index idx_rulesets_placement on rulesets (placement_id, priority);
