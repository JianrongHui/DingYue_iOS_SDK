alter table analytics_sinks add column created_at timestamptz;
alter table analytics_sinks add column updated_at timestamptz;

update analytics_sinks
set created_at = now(),
    updated_at = now()
where created_at is null
   or updated_at is null;

alter table analytics_sinks alter column created_at set not null;
alter table analytics_sinks alter column updated_at set not null;
