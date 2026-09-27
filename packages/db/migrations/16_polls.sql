-- Apply manually in Supabase SQL editor. No sample polls or votes are inserted.
begin;
create table if not exists polls (
  id uuid primary key default gen_random_uuid(),
  question text not null check (char_length(question) between 5 and 220),
  description text not null default '' check (char_length(description) <= 300),
  options jsonb not null check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) between 2 and 6),
  status text not null default 'draft' check (status in ('draft','open','closed','archived')),
  featured boolean not null default false,
  starts_at timestamptz, ends_at timestamptz,
  adjustments jsonb not null default '{}' check (jsonb_typeof(adjustments) = 'object'),
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  check (ends_at is null or starts_at is null or ends_at > starts_at),
  check (not featured or status in ('open','closed'))
);
create unique index if not exists polls_one_featured on polls (featured) where featured;
create table if not exists poll_votes (
  id bigint generated always as identity primary key,
  poll_id uuid not null references polls(id),
  option_id uuid not null,
  visitor_hash text not null check (length(visitor_hash) = 64),
  ip_hash text not null check (length(ip_hash) = 64),
  created_at timestamptz not null default now(),
  unique (poll_id, visitor_hash)
);
create index if not exists poll_votes_ip on poll_votes (poll_id, ip_hash);
create index if not exists poll_votes_option on poll_votes (poll_id, option_id);
create index if not exists poll_votes_recent on poll_votes (poll_id, id desc);
create table if not exists poll_revisions (
  id bigint generated always as identity primary key,
  poll_id uuid not null references polls(id),
  actor_id text not null,
  actor_name text not null,
  reason text not null,
  snapshot jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists poll_revisions_recent on poll_revisions (poll_id, id desc);
-- Defense in depth: votes and revision records are append-only, including for the app DB role.
create or replace function poll_immutable_record() returns trigger language plpgsql as $$
begin raise exception 'Poll votes and revisions are append-only'; end $$;
drop trigger if exists poll_votes_immutable on poll_votes;
create trigger poll_votes_immutable before update or delete on poll_votes for each row execute function poll_immutable_record();
drop trigger if exists poll_revisions_immutable on poll_revisions;
create trigger poll_revisions_immutable before update or delete on poll_revisions for each row execute function poll_immutable_record();
-- Every writer, not only the HTTP endpoint, must serialize through the poll row.
create or replace function poll_guard_vote() returns trigger language plpgsql as $$
declare p polls%rowtype;
begin
  select * into p from polls where id = new.poll_id for update;
  if not found or p.status <> 'open' or (p.starts_at is not null and p.starts_at > clock_timestamp()) or (p.ends_at is not null and p.ends_at <= clock_timestamp()) then
    raise exception 'poll_closed';
  end if;
  if not exists (select 1 from jsonb_array_elements(p.options) o where o->>'id' = new.option_id::text) then raise exception 'poll_invalid_option'; end if;
  if (select count(*) from poll_votes where poll_id = new.poll_id and ip_hash = new.ip_hash) >= 3 then raise exception 'poll_ip_limit'; end if;
  return new;
end $$;
drop trigger if exists poll_vote_guard on poll_votes;
create trigger poll_vote_guard before insert on poll_votes for each row execute function poll_guard_vote();
alter table polls enable row level security;
alter table poll_votes enable row level security;
alter table poll_revisions enable row level security;
revoke all on polls, poll_votes, poll_revisions from anon, authenticated;
commit;
