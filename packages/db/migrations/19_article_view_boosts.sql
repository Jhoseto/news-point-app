-- Editorial view additions. Real opens stay in article_read_counts.
-- Koce applies migrations manually.
begin;

create table if not exists article_view_boosts (
  article_id uuid primary key references articles(id) on delete cascade,
  seed_count bigint not null default 0 check (seed_count >= 0),
  artificial_count bigint not null default 0 check (artificial_count >= 0),
  interval_seconds integer check (interval_seconds is null or interval_seconds > 0),
  target_count bigint check (target_count is null or target_count >= 0),
  seeded_at timestamptz,
  next_increment_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists article_view_boosts_due_idx
  on article_view_boosts (next_increment_at)
  where next_increment_at is not null;

alter table article_view_boosts enable row level security;

commit;
