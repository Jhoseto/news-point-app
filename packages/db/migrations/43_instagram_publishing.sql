-- Additive Instagram opt-in only; no archive backfill or automatic posts.
begin;
alter table article_revision_social drop constraint if exists article_revision_social_provider_check;
alter table article_revision_social add constraint article_revision_social_provider_check check(provider in ('facebook','instagram'));
create table if not exists instagram_publications (
  id uuid primary key default gen_random_uuid(), article_id uuid unique references articles(id) on delete set null,
  revision integer not null, account_id text not null, title text not null, caption text not null check(length(caption)<=2200),
  article_url text not null, storage_key text,
  status text not null default 'pending' check(status in ('pending','working','sending','retry','failed','uncertain','succeeded','cancelled')),
  image_key text, image_hash text, post_id text, permalink text,
  attempts integer not null default 0, next_attempt_at timestamptz not null default now(),
  lease_token uuid, lease_until timestamptz, operation_started_at timestamptz, error_code text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists instagram_publications_due on instagram_publications(status,next_attempt_at);
commit;
