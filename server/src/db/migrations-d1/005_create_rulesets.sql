create table rulesets (
  id text primary key,
  app_id text not null,
  placement_id text not null,
  priority integer not null,
  condition text not null,
  variant_id text not null,
  experiment_id text,
  created_at text not null
);

create index idx_rulesets_placement on rulesets (placement_id, priority);
