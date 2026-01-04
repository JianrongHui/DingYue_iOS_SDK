create table packages (
  id uuid primary key,
  app_id text not null,
  placement_id text not null,
  version text not null,
  checksum text not null,
  entry_path text not null,
  cdn_url text not null,
  size_bytes bigint not null,
  created_at timestamptz not null
);
