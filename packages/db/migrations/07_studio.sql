-- 07 Studio: staff accounts (Better Auth), article revisions, publish requests (T8).
-- Requires 06. Safe to re-run. Nothing is dropped or rewritten.

-- Better Auth core tables (DEC-110), renamed with a staff_ prefix.
-- Ids are text because Better Auth generates them.
create table if not exists public.staff_users (
  id              text primary key,
  name            text not null,
  email           text not null unique,
  email_verified  boolean not null default false,
  image           text,
  -- Server-owned; never accepted from sign-in input.
  role            text not null default 'reporter'
                  check (role in ('reporter', 'editor', 'chief_editor', 'admin')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table if not exists public.staff_sessions (
  id          text primary key,
  expires_at  timestamptz not null,
  token       text not null unique,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  ip_address  text,
  user_agent  text,
  user_id     text not null references public.staff_users (id) on delete cascade
);
create index if not exists staff_sessions_user_idx on public.staff_sessions (user_id);

create table if not exists public.staff_accounts (
  id                        text primary key,
  account_id                text not null,
  provider_id               text not null,
  user_id                   text not null references public.staff_users (id) on delete cascade,
  access_token              text,
  refresh_token             text,
  id_token                  text,
  access_token_expires_at   timestamptz,
  refresh_token_expires_at  timestamptz,
  scope                     text,
  -- Password hash written by Better Auth; never the password itself.
  password                  text,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);
create index if not exists staff_accounts_user_idx on public.staff_accounts (user_id);

create table if not exists public.staff_verifications (
  id          text primary key,
  identifier  text not null,
  value       text not null,
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists staff_verifications_identifier_idx on public.staff_verifications (identifier);

-- Studio articles. The articles row stays the public version; edits are
-- revisions until someone publishes one.
alter table public.articles
  add column if not exists published_revision integer check (published_revision > 0),
  add column if not exists created_by text references public.staff_users (id) on delete set null;

-- Every save is a new row; history is never overwritten.
create table if not exists public.article_revisions (
  id                   uuid primary key default gen_random_uuid(),
  article_id           uuid not null references public.articles (id) on delete cascade,
  number               integer not null check (number > 0),
  title                text not null,
  slug                 text not null,
  excerpt              text not null default '',
  body                 jsonb not null check (jsonb_typeof(body) = 'array'),
  primary_category_id  uuid references public.categories (id) on delete set null,
  hero_media_id        uuid references public.media_assets (id) on delete set null,
  created_by           text references public.staff_users (id) on delete set null,
  created_at           timestamptz not null default now(),
  unique (article_id, number)
);

-- One row per publish click: a repeated idempotency key returns the first outcome.
create table if not exists public.publish_requests (
  idempotency_key  uuid primary key,
  article_id       uuid not null references public.articles (id) on delete cascade,
  revision         integer not null check (revision > 0),
  requested_by     text references public.staff_users (id) on delete set null,
  outcome          jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now()
);

alter table public.staff_users enable row level security;
alter table public.staff_sessions enable row level security;
alter table public.staff_accounts enable row level security;
alter table public.staff_verifications enable row level security;
alter table public.article_revisions enable row level security;
alter table public.publish_requests enable row level security;
