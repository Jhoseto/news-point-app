-- 03 Media assets. Images are referenced, not copied: provider
-- 'wordpress_origin' keeps the original URL. Requires 01.
-- Safe to re-run.

create table if not exists public.media_assets (
  id           uuid primary key default gen_random_uuid(),
  provider     text not null check (provider in ('wordpress_origin', 'object_storage')),
  source_url   text,
  storage_key  text,
  width        integer check (width > 0),
  height       integer check (height > 0),
  mime         text,
  alt          text not null default '',
  caption      text not null default '',
  credit       text not null default '',
  wp_id        integer unique,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint media_assets_location_check check (
    (provider = 'wordpress_origin' and source_url is not null)
    or (provider = 'object_storage' and storage_key is not null)
  )
);

-- Inline images inside article text often have no WordPress media id.
create unique index if not exists media_assets_origin_url_key
  on public.media_assets (source_url)
  where provider = 'wordpress_origin';

drop trigger if exists media_assets_set_updated_at on public.media_assets;
create trigger media_assets_set_updated_at
  before update on public.media_assets
  for each row execute function public.set_updated_at();

alter table public.media_assets enable row level security;
