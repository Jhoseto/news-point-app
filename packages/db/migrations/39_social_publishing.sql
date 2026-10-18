-- Additive; Koce applies manually. No content changes or automatic Facebook posts.
begin;
create table if not exists article_revision_social (
  article_id uuid not null, revision integer not null, provider text not null default 'facebook' check(provider = 'facebook'),
  enabled boolean not null default false, text text not null default '', text_mode text not null check(text_mode in ('auto','custom')),
  primary key(article_id, revision, provider),
  foreign key(article_id, revision) references article_revisions(article_id, number) on delete cascade,
  check(length(text) <= 60000)
);
create table if not exists social_connections (
  provider text primary key check(provider = 'facebook'), page_id text not null, name text not null,
  encrypted_token text not null, meta_user_id text, status text not null check(status in ('connected','invalid','disconnected')),
  permissions jsonb not null default '[]', connected_by text references staff_users(id) on delete set null,
  generation integer not null default 1, checked_at timestamptz, expires_at timestamptz,
  updated_at timestamptz not null default now()
);
create table if not exists social_publications (
  id uuid primary key default gen_random_uuid(), article_id uuid references articles(id) on delete set null,
  revision integer not null, provider text not null default 'facebook' check(provider = 'facebook'), page_id text not null,
  text text not null, article_url text not null, media_id uuid, storage_key text,
  status text not null default 'pending' check(status in ('pending','working','sending','retry','failed','uncertain','succeeded','cancelled')),
  step text not null default 'prepare' check(step in ('prepare','photo','resolve','comment')),
  photo_id text, post_id text, comment_id text, permalink text,
  prepared_file text, prepared_hash text, attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(), lease_token uuid, lease_until timestamptz,
  operation_started_at timestamptz, error_code text, trace_id text,
  history jsonb not null default '[]', created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(article_id, provider, page_id), check(length(text) <= 60000)
);
create index if not exists social_publications_due on social_publications(status, next_attempt_at);
create index if not exists social_publications_lease on social_publications(lease_until) where lease_token is not null;
create table if not exists social_oauth_states (
  id text primary key, actor_id text not null references staff_users(id) on delete cascade,
  redirect_uri text not null, phase text not null check(phase in ('authorize','select')),
  encrypted_pages text, expires_at timestamptz not null
);
create table if not exists social_deletion_receipts (
  id uuid primary key, expires_at timestamptz not null
);
commit;
