-- 06 Article version and outbox for live updates (T7). Requires 04.
-- Every public change writes an outbox row in the same transaction as the
-- article. The web app reads rows by id, so a restart loses nothing.
-- Safe to re-run.

alter table public.articles
  add column if not exists version integer not null default 1 check (version > 0);

create table if not exists public.outbox_events (
  -- Monotonic event id; also the SSE Last-Event-ID.
  id           bigint generated always as identity primary key,
  type         text not null check (type in ('article.published', 'article.updated')),
  entity_id    uuid not null references public.articles (id) on delete cascade,
  version      integer not null check (version > 0),
  -- Public data only: path, topics, title. No drafts or internal fields.
  payload      jsonb not null check (jsonb_typeof(payload) = 'object'),
  occurred_at  timestamptz not null default now()
);

create index if not exists outbox_events_entity_idx
  on public.outbox_events (entity_id, id desc);

-- Wakes listeners; they then read the rows, so a missed notify is harmless.
create or replace function public.notify_outbox_event()
returns trigger
language plpgsql
as $$
begin
  perform pg_notify('np_outbox', new.id::text);
  return new;
end;
$$;

drop trigger if exists outbox_events_notify on public.outbox_events;
create trigger outbox_events_notify
  after insert on public.outbox_events
  for each row execute function public.notify_outbox_event();

alter table public.outbox_events enable row level security;
