-- Koce applies manually. One current message, with append-only editorial history.
begin;

create table if not exists public.breaking_bulletins (
  id bigint generated always as identity primary key,
  enabled boolean not null default false,
  text text not null default '',
  article_id uuid references public.articles(id) on delete set null,
  actor_id text references public.staff_users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint breaking_bulletins_text_check check (char_length(text) <= 500 and (not enabled or char_length(btrim(text)) > 0))
);
create index if not exists breaking_bulletins_article_idx on public.breaking_bulletins(article_id);
create index if not exists breaking_bulletins_actor_idx on public.breaking_bulletins(actor_id);
alter table public.breaking_bulletins enable row level security;

alter table public.outbox_events drop constraint if exists outbox_events_type_check;
alter table public.outbox_events add constraint outbox_events_type_check check (
  type in ('article.published', 'article.updated', 'layout.updated', 'story.published', 'story.updated', 'breaking.updated')
);
commit;
