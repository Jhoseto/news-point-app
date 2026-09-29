-- Future publication instant. The value is an absolute time (Bulgarian wall clock
-- converted to UTC). Comparison uses now(), not the database server's TimeZone.
begin;

alter table articles
  add column if not exists scheduled_publish_at timestamptz;

create index if not exists articles_scheduled_publish_idx
  on articles (scheduled_publish_at)
  where scheduled_publish_at is not null and is_public = false;

commit;
