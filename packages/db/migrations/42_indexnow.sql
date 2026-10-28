-- Requires 06 and 30. Koce applies manually. No historical backfill.
begin;

create table if not exists public.indexnow_jobs (
  path text primary key,
  article_id uuid not null, -- deliberately no FK: removal must survive article deletion
  version integer not null,
  generation bigint not null default 1,
  status text not null default 'pending' check (status in ('pending','sending','accepted','failed','skipped')),
  attempts integer not null default 0,
  due_at timestamptz not null default now() + interval '30 seconds',
  lease_token uuid,
  lease_until timestamptz,
  last_status integer,
  error_code text,
  updated_at timestamptz not null default now(),
  accepted_at timestamptz
);
create index if not exists indexnow_jobs_due on public.indexnow_jobs(due_at) where status = 'pending';
create index if not exists indexnow_jobs_lease on public.indexnow_jobs(lease_until) where status = 'sending';
alter table public.indexnow_jobs enable row level security;

create or replace function public.enqueue_indexnow()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare a public.articles%rowtype;
begin
  if new.type not in ('article.published','article.updated') then return new; end if;
  select * into a from public.articles where id = new.entity_id;
  -- publishRevision assigns the timestamp after the transaction started;
  -- now() is frozen at transaction start and would incorrectly reject that publication.
  if not found or a.published_at is null or a.published_at > clock_timestamp()
     or (not a.is_public and new.payload #>> '{visibilityChange,visible}' is distinct from 'false')
     or exists(select 1 from public.editor_qa_articles where article_id = a.id)
     or new.payload->>'path' is distinct from a.path then return new; end if;

  insert into public.indexnow_jobs(path, article_id, version)
  values(a.path, a.id, new.version)
  on conflict(path) do update set
    article_id = excluded.article_id, version = excluded.version,
    generation = indexnow_jobs.generation + 1, status = 'pending', attempts = 0,
    due_at = now() + interval '30 seconds', updated_at = now(),
    lease_token = null, lease_until = null, last_status = null, error_code = null, accepted_at = null
  where indexnow_jobs.article_id <> excluded.article_id or indexnow_jobs.version < excluded.version;
  return new;
end;
$$;
drop trigger if exists outbox_indexnow on public.outbox_events;
create trigger outbox_indexnow after insert on public.outbox_events
  for each row execute function public.enqueue_indexnow();
comment on table public.indexnow_jobs is 'Public URL notifications only; no bodies, credentials or drafts. Accepted means received, not indexed.';
commit;
