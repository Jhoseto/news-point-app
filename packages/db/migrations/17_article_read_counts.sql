-- Apply manually. Counts start at zero and contain no reader identifiers.
begin;

create table if not exists article_read_counts (
  article_id uuid primary key references articles(id) on delete cascade,
  read_count bigint not null default 0 check (read_count >= 0),
  updated_at timestamptz not null default now()
);

alter table article_read_counts enable row level security;

commit;
