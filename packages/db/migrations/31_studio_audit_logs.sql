-- Staff activity journal. Koce applies this migration manually.
begin;
create extension if not exists pg_trgm;

create table if not exists studio_audit_logs (
  id uuid primary key,
  started_at timestamptz not null,
  occurred_at timestamptz not null,
  actor_id text,
  actor_name text not null default '',
  actor_email text not null default '',
  actor_role text check (actor_role in ('editor', 'admin', 'master_admin')),
  area text not null,
  action text not null,
  action_label text not null,
  entity_kind text not null default '',
  entity_id text not null default '',
  entity_label text not null default '',
  target_path text,
  outcome text not null check (outcome in ('pending', 'success', 'failure', 'access')),
  method text not null,
  path text not null,
  status_code integer,
  duration_ms integer,
  ip text not null default '',
  user_agent text not null default '',
  details jsonb not null default '{}'::jsonb,
  search_text text not null,
  check (status_code is null or status_code between 100 and 599),
  check (duration_ms is null or duration_ms >= 0)
);
-- Snapshots deliberately have no FK to staff/content: deleted objects keep their history.
create index if not exists studio_audit_time_idx on studio_audit_logs (started_at desc, id);
create index if not exists studio_audit_actor_time_idx on studio_audit_logs (actor_id, started_at desc);
create index if not exists studio_audit_area_time_idx on studio_audit_logs (area, started_at desc);
create index if not exists studio_audit_action_time_idx on studio_audit_logs (action, started_at desc);
create index if not exists studio_audit_outcome_time_idx on studio_audit_logs (outcome, started_at desc);
create index if not exists studio_audit_entity_idx on studio_audit_logs (entity_kind, entity_id, started_at desc);
create index if not exists studio_audit_search_idx on studio_audit_logs using gin (search_text gin_trgm_ops);
alter table studio_audit_logs enable row level security;

-- Requests may be finalized once. Completed records cannot be edited or removed.
create or replace function protect_studio_audit_log() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then raise exception 'Audit records cannot be deleted'; end if;
  if old.outcome <> 'pending' or new.outcome not in ('success', 'failure')
    or new.id is distinct from old.id or new.started_at is distinct from old.started_at
    or new.method is distinct from old.method or new.path is distinct from old.path
    or (old.actor_id is not null and new.actor_id is distinct from old.actor_id)
  then raise exception 'Audit records can only be finalized once'; end if;
  return new;
end $$;
drop trigger if exists studio_audit_immutable on studio_audit_logs;
create trigger studio_audit_immutable before update or delete on studio_audit_logs
  for each row execute function protect_studio_audit_log();
commit;
