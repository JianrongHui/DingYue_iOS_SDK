create table packages (
  id text primary key,
  app_id text not null,
  placement_id text not null,
  version text not null,
  checksum text not null,
  entry_path text not null,
  cdn_url text not null,
  size_bytes integer not null,
  created_at text not null
);
