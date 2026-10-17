-- Durable resumable Studio uploads. Apply manually; no existing media is changed.
begin;
alter table podcasts add column if not exists revision integer not null default 1;
create table if not exists media_upload_sessions (
 id uuid primary key, owner_id text references staff_users(id) on delete set null,
 kind text not null check(kind in ('video','podcast')),
 state text not null default 'uploading' check(state in ('uploading','queued','processing','ready','failed','cancelled','expired')),
 manifest jsonb not null, metadata jsonb not null,
 reserved_bytes bigint not null check(reserved_bytes between 1 and 1048576000),
 expires_at timestamptz not null, lease_token uuid, lease_until timestamptz,
 attempts integer not null default 0, result jsonb, error text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists media_upload_owner_idx on media_upload_sessions(owner_id,state);
create index if not exists media_upload_queue_idx on media_upload_sessions(state,created_at);
create table if not exists media_upload_chunks (
 session_id uuid not null references media_upload_sessions(id) on delete cascade,
 file_key text not null check(file_key in ('video','audio','cover')),
 chunk_index integer not null check(chunk_index>=0), bytes integer not null check(bytes between 1 and 4194304),
 sha256 text not null check(sha256 ~ '^[0-9a-f]{64}$'),
 primary key(session_id,file_key,chunk_index)
);
alter table media_upload_sessions add column if not exists cleaned_at timestamptz;
alter table media_upload_sessions add column if not exists artifacts jsonb not null default '[]'::jsonb;
alter table media_upload_sessions alter column owner_id drop not null;
alter table media_upload_sessions drop constraint if exists media_upload_sessions_owner_id_fkey;
alter table media_upload_sessions add constraint media_upload_sessions_owner_id_fkey foreign key(owner_id) references staff_users(id) on delete set null;
alter table media_upload_sessions drop constraint if exists media_upload_sessions_reserved_bytes_check;
alter table media_upload_sessions add constraint media_upload_sessions_reserved_bytes_check check(reserved_bytes between 1 and 1048576000);
alter table media_upload_sessions enable row level security;
alter table media_upload_chunks enable row level security;
revoke all on media_upload_sessions, media_upload_chunks from public;
-- Uploaded leading video uses the same strict local URL contract as editorial.ts.
alter table articles drop constraint if exists articles_hero_embed_https_chk;
alter table articles add constraint articles_hero_embed_https_chk check (
 hero_embed_url is null or hero_embed_url ~ '^https://' or
 hero_embed_url ~* '^/media/news/[0-9]{4}/(0[1-9]|1[0-2])/[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}\.mp4$'
);
alter table article_revisions drop constraint if exists article_revisions_hero_embed_https_chk;
alter table article_revisions add constraint article_revisions_hero_embed_https_chk check (
 hero_embed_url is null or hero_embed_url ~ '^https://' or
 hero_embed_url ~* '^/media/news/[0-9]{4}/(0[1-9]|1[0-2])/[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}\.mp4$'
);
commit;
