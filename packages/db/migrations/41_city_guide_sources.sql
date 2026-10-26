-- Isolated city-guide evidence and records. New sources are hidden by default.
begin;

create table if not exists public.city_sources (
  id text primary key,
  category text not null,
  source_url text not null,
  format text not null,
  refresh_seconds integer not null default 86400 check (refresh_seconds between 300 and 604800),
  review_state text not null default 'pilot' check (review_state in ('candidate', 'pilot', 'accepted', 'rejected')),
  publication_state text not null default 'hidden' check (publication_state in ('hidden', 'visible')),
  last_check_at timestamptz,
  last_success_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint city_sources_visible_reviewed check (publication_state <> 'visible' or review_state = 'accepted'),
  constraint city_sources_url_https check (source_url ~ '^https://')
);

create table if not exists public.city_source_checks (
  id bigint generated always as identity primary key,
  source_id text not null references public.city_sources(id) on delete restrict,
  checked_at timestamptz not null,
  outcome text not null check (outcome in ('parsed', 'unchanged', 'unavailable')),
  http_status smallint check (http_status between 100 and 599),
  item_count integer not null default 0 check (item_count >= 0),
  added_count integer not null default 0 check (added_count >= 0),
  changed_count integer not null default 0 check (changed_count >= 0),
  missing_count integer not null default 0 check (missing_count >= 0),
  detail text check (char_length(detail) <= 2000),
  created_at timestamptz not null default now()
);
create index if not exists city_source_checks_recent_idx on public.city_source_checks(source_id, checked_at desc);

create table if not exists public.city_records (
  source_id text not null references public.city_sources(id) on delete restrict,
  record_key text not null,
  fields jsonb not null check (jsonb_typeof(fields) = 'object'),
  fingerprint text not null check (fingerprint ~ '^[0-9a-f]{64}$'),
  state text not null default 'current' check (state in ('current', 'missing')),
  first_seen_at timestamptz not null,
  last_seen_at timestamptz not null,
  missing_since timestamptz,
  updated_at timestamptz not null default now(),
  primary key (source_id, record_key),
  constraint city_records_seen_order check (last_seen_at >= first_seen_at),
  constraint city_records_missing_state check ((state = 'missing') = (missing_since is not null))
);
create index if not exists city_records_current_idx on public.city_records(source_id, last_seen_at desc) where state = 'current';

create table if not exists public.city_record_versions (
  id bigint generated always as identity primary key,
  source_id text not null,
  record_key text not null,
  fingerprint text not null check (fingerprint ~ '^[0-9a-f]{64}$'),
  fields jsonb not null check (jsonb_typeof(fields) = 'object'),
  change_kind text not null check (change_kind in ('first', 'changed', 'missing', 'returned')),
  observed_at timestamptz not null,
  foreign key (source_id, record_key) references public.city_records(source_id, record_key) on delete restrict
);
create index if not exists city_record_versions_history_idx on public.city_record_versions(source_id, record_key, observed_at desc);

alter table public.city_sources enable row level security;
alter table public.city_source_checks enable row level security;
alter table public.city_records enable row level security;
alter table public.city_record_versions enable row level security;
revoke all on public.city_sources, public.city_source_checks, public.city_records, public.city_record_versions from public;

commit;
