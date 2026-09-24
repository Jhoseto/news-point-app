-- 10 LivePoint citizen submissions (signals and "my news").
-- Requires nothing beyond 01 helpers. Safe to re-run. Nothing is dropped.
-- Public only after editorial approval (status flow). Files are not stored yet.

create table if not exists public.livepoint_submissions (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (kind in ('report', 'my_news')),
  status      text not null default 'received'
              check (status in ('received', 'in_review', 'verified', 'rejected', 'published')),
  payload     jsonb not null default '{}'::jsonb,
  contact     text,
  -- Optional abuse signal; never shown publicly.
  ip_hash     text,
  user_agent  text,
  article_id  uuid references public.articles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists livepoint_submissions_kind_status_idx
  on public.livepoint_submissions (kind, status, created_at desc);

alter table public.livepoint_submissions enable row level security;
