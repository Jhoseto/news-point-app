-- Requires 25 and 26. Koce applies manually. No historical backfill.
begin;

alter table public.push_subscriptions add column if not exists revision integer not null default 1;

create table if not exists public.push_jobs (
  id uuid primary key default gen_random_uuid(),
  event_id bigint unique,
  article_id uuid references public.articles(id) on delete cascade,
  subscription_id uuid references public.push_subscriptions(id) on delete cascade,
  kind text not null check (kind in ('article', 'test')),
  status text not null default 'pending' check (status in ('pending', 'expanded', 'skipped')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '1 hour',
  check ((kind = 'article' and event_id is not null and article_id is not null and subscription_id is null)
      or (kind = 'test' and event_id is null and article_id is null and subscription_id is not null))
);
create index if not exists push_jobs_pending_idx on public.push_jobs(created_at) where status = 'pending';

create table if not exists public.push_deliveries (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.push_jobs(id) on delete cascade,
  subscription_id uuid not null references public.push_subscriptions(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'sending', 'accepted', 'failed', 'skipped')),
  attempts integer not null default 0,
  due_at timestamptz not null default now(),
  lease_until timestamptz,
  lease_token uuid,
  last_status integer,
  error_code text,
  accepted_at timestamptz,
  unique(job_id, subscription_id)
);
create index if not exists push_deliveries_due_idx on public.push_deliveries(due_at) where status = 'pending';
create index if not exists push_deliveries_lease_idx on public.push_deliveries(lease_until) where status = 'sending';

-- Durable rate limits shared by web processes; never store raw IPs/endpoints.
create table if not exists public.push_rate_limits (
  bucket text primary key,
  window_start timestamptz not null default now(),
  hits integer not null default 1
);

-- A committed publication always has a committed push job. There is no
-- high-water cursor that could skip a transaction committed out of id order.
-- Existing outbox rows are intentionally not replayed to subscribers.
create or replace function public.enqueue_reader_push()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if new.type = 'article.published' then
    insert into public.push_jobs(event_id, article_id, kind, created_at, expires_at)
    values (new.id, new.entity_id, 'article', new.occurred_at, new.occurred_at + interval '1 hour')
    on conflict (event_id) do nothing;
  end if;
  return new;
end;
$$;
drop trigger if exists outbox_reader_push on public.outbox_events;
create trigger outbox_reader_push after insert on public.outbox_events
  for each row execute function public.enqueue_reader_push();

comment on column public.push_subscriptions.category_slugs is 'NULL = all; [] = no rubrics; non-empty array = selected rubrics.';
comment on column public.push_subscriptions.last_notified_at is 'Last acceptance by the push service, not confirmed display on a device.';
comment on table public.push_jobs is 'Reader push only; no historical bootstrap; jobs expire after one hour.';
commit;
