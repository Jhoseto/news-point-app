-- Additive NewsPoint Smart foundation. No content backfill or provider calls.
begin;
create view smart_public_articles as
select id, title, path, excerpt, body, published_at, updated_at,
  md5(title || excerpt || body::text || coalesce(published_revision::text,'') || coalesce(extract(epoch from source_modified_at)::text,'')) as revision
from articles where is_public and published_at <= now();

create table ai_operations (
  id uuid primary key, module text not null, provider text not null, project_id text,
  article_id uuid references articles(id) on delete set null, article_snapshot jsonb not null default '{}',
  operation text not null, model text not null, environment text not null,
  status text not null check(status in ('pending','known','unknown','failed')),
  response_id text unique, request_id text, usage jsonb, rate jsonb, amount_usd numeric(30,12),
  error_code text, started_at timestamptz not null default now(), finished_at timestamptz,
  check(amount_usd is null or amount_usd >= 0)
);
create index ai_operations_period on ai_operations(started_at,module);
create index ai_operations_article on ai_operations(article_id,started_at);
create index ai_operations_article_identity on ai_operations((coalesce(article_id,(article_snapshot->>'id')::uuid)),started_at);
create table ai_provider_costs (
  provider text not null, project_id text not null, bucket_start timestamptz not null,
  bucket_end timestamptz not null, line_item text not null, currency text not null,
  amount numeric(30,12) not null, checked_at timestamptz not null default now(),
  primary key(provider,project_id,bucket_start,line_item,currency)
);
create table smart_sessions (
  id uuid primary key, article_id uuid not null references articles(id) on delete cascade,
  owner_hash text not null, revision text not null, used integer not null default 0 check(used between 0 and 5),
  deleted_at timestamptz, expires_at timestamptz not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(article_id,owner_hash)
);
create table smart_nodes (
  key text primary key, article_id uuid not null references articles(id) on delete cascade,
  revision text not null, parent_key text references smart_nodes(key) on delete cascade,
  question_id text not null, question text not null, answer jsonb,
  state text not null check(state in ('pending','ready','failed','uncertain')),
  lease_token uuid, lease_until timestamptz,
  expires_at timestamptz, created_at timestamptz not null default now()
);
create index smart_nodes_article on smart_nodes(article_id);
create index smart_nodes_parent on smart_nodes(parent_key);
create table smart_dependencies (
  node_key text not null references smart_nodes(key) on delete cascade,
  article_id uuid not null references articles(id) on delete cascade, revision text not null,
  primary key(node_key,article_id)
);
create table smart_turns (
  id uuid primary key, session_id uuid not null references smart_sessions(id) on delete cascade,
  request_key uuid not null, input_hash text not null, question text not null,
  question_id text, parent_key text, node_key text references smart_nodes(key) on delete set null,
  status text not null check(status in ('pending','completed','failed')),
  answer jsonb, cached boolean not null default false, counted boolean not null default false,
  processor_token uuid, error_code text,
  lease_until timestamptz not null, created_at timestamptz not null default now(),
  unique(session_id,request_key)
);
create unique index smart_one_active_turn on smart_turns(session_id) where status='pending';
create table smart_bootstraps (
  article_id uuid primary key references articles(id) on delete cascade,
  revision text not null, payload jsonb, sources jsonb not null default '[]',
  state text not null check(state in ('pending','ready','failed','uncertain')),
  lease_token uuid, lease_until timestamptz, expires_at timestamptz,
  updated_at timestamptz not null default now()
);
create table smart_feedback (
  session_id uuid not null references smart_sessions(id) on delete cascade,
  turn_id uuid not null references smart_turns(id) on delete cascade,
  useful boolean not null, created_at timestamptz not null default now(), primary key(session_id,turn_id)
);
create table smart_activity (
  turn_id uuid primary key, article_id uuid references articles(id) on delete set null,
  article_snapshot jsonb not null, cached boolean not null, environment text not null,
  created_at timestamptz not null default now()
);
create index smart_activity_article on smart_activity(article_id,created_at);
create table smart_rate_windows (
  key text not null, bucket timestamptz not null, count integer not null default 1,
  primary key(key,bucket)
);
-- Durable claims prevent duplicate paid indexing across worker processes.
create table smart_index_jobs (
  article_id uuid primary key references articles(id) on delete cascade,
  revision text not null, lease_token uuid not null, lease_until timestamptz not null,
  state text not null check(state in ('pending','ready','uncertain'))
);
create index smart_turns_queue on smart_turns(created_at) where status='pending';
create index smart_sessions_expiry on smart_sessions(expires_at);
create index smart_dependencies_article on smart_dependencies(article_id);
create index smart_activity_article_identity on smart_activity((coalesce(article_id,(article_snapshot->>'id')::uuid)),created_at);
commit;
