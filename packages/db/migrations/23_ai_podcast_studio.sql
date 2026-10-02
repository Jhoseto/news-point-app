-- AI Studio projects and durable production jobs. Apply manually after 22.
begin;

create table if not exists ai_podcast_projects (
  id uuid primary key default gen_random_uuid(),
  settings jsonb not null,
  sources jsonb not null,
  fact_packs jsonb not null default '{}'::jsonb,
  segments jsonb not null default '[]'::jsonb,
  title text,
  summary text,
  warnings jsonb not null default '[]'::jsonb,
  status text not null default 'new' check (status in ('new','scripting','review','producing','ready','failed')),
  revision integer not null default 1 check (revision > 0),
  cover_key text,
  music_asset_id uuid,
  episode_id uuid unique references podcasts(id) on delete set null,
  created_by text references staff_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists ai_podcast_assets (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('music','cover')),
  preset text check (preset in ('daily','evening','breaking')),
  status text not null default 'candidate' check (status in ('candidate','approved')),
  storage_key text not null,
  prompt text not null,
  model text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_by text references staff_users(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table ai_podcast_projects add constraint ai_podcast_projects_music_fk foreign key (music_asset_id) references ai_podcast_assets(id) on delete set null;
create unique index if not exists ai_podcast_one_approved_preset on ai_podcast_assets(preset) where kind = 'music' and status = 'approved' and preset is not null;

create table if not exists ai_podcast_jobs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references ai_podcast_projects(id) on delete cascade,
  kind text not null check (kind in ('script','check','produce','segment','music','cover')),
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued' check (status in ('queued','running','succeeded','failed','cancelled')),
  attempts integer not null default 0 check (attempts between 0 and 5),
  lease_until timestamptz,
  error text,
  usage jsonb not null default '{}'::jsonb,
  requested_by text references staff_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ai_podcast_jobs_queue on ai_podcast_jobs(created_at) where status in ('queued','running');
create unique index if not exists ai_podcast_one_active_project_job on ai_podcast_jobs(project_id) where project_id is not null and status in ('queued','running');

create table if not exists ai_podcast_audit (
  id bigint generated always as identity primary key,
  project_id uuid not null references ai_podcast_projects(id) on delete cascade,
  actor_id text references staff_users(id) on delete set null,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists ai_podcast_audit_project on ai_podcast_audit(project_id, id desc);

create table if not exists ai_podcast_voice_settings (
  id boolean primary key default true check (id),
  alex_voice text not null,
  maya_voice text not null,
  approved_by text references staff_users(id) on delete set null,
  updated_at timestamptz not null default now()
);

commit;
