-- Editorial placement of stories into the existing homepage and category slots.
-- Koce applies migrations manually. Safe to re-run the table creation.
begin;

create table if not exists page_arrangements (
  id uuid primary key default gen_random_uuid(),
  page_key text not null,
  status text not null check (status in ('draft', 'published', 'history')),
  document jsonb not null check (jsonb_typeof(document) = 'object'),
  note text not null default '',
  placed_by text references staff_users(id) on delete set null,
  published_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists page_arrangements_page_idx
  on page_arrangements (page_key, created_at desc);

create unique index if not exists page_arrangements_one_live_idx
  on page_arrangements (page_key, status)
  where status in ('draft', 'published');

alter table page_arrangements enable row level security;

-- A published arrangement is not an article, so the outbox row has no article id.
alter table public.outbox_events alter column entity_id drop not null;

do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select conname
    from pg_constraint
    where conrelid = 'public.outbox_events'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%article.published%'
  loop
    execute format('alter table public.outbox_events drop constraint %I', constraint_name);
  end loop;
end $$;

alter table public.outbox_events
  add constraint outbox_events_type_check
  check (type in ('article.published', 'article.updated', 'layout.updated'));

commit;
