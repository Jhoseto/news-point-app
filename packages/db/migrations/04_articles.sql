-- 04 Articles. Requires 01, 02, 03.
-- Public = is_public and published_at <= now(). Everything else is hidden.
-- Safe to re-run.

create table if not exists public.articles (
  id                   uuid primary key default gen_random_uuid(),
  source_system        text not null check (source_system in ('wordpress', 'studio')),
  legacy_id            bigint,
  slug                 text not null,
  -- Exact original path, e.g. /some-article-slug/
  path                 text not null unique check (path ~ '^/[^?#]+/$'),
  source_url           text,
  title                text not null check (length(trim(title)) > 0),
  excerpt              text not null default '',
  author_name          text not null default 'NewsPoint.bg',
  hero_media_id        uuid references public.media_assets (id) on delete set null,
  primary_category_id  uuid references public.categories (id) on delete set null,
  body                 jsonb not null default '[]'::jsonb check (jsonb_typeof(body) = 'array'),
  body_version         smallint not null default 1,
  -- Original HTML, kept for lossless re-conversion. Never rendered directly.
  source_html          text,
  is_public            boolean not null default false,
  published_at         timestamptz,
  source_modified_at   timestamptz,
  imported_at          timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint articles_source_legacy_key unique (source_system, legacy_id),
  constraint articles_wordpress_has_legacy_id check (source_system <> 'wordpress' or legacy_id is not null),
  constraint articles_public_has_date check (not is_public or published_at is not null)
);

create index if not exists articles_public_published_idx
  on public.articles (published_at desc)
  where is_public;

drop trigger if exists articles_set_updated_at on public.articles;
create trigger articles_set_updated_at
  before update on public.articles
  for each row execute function public.set_updated_at();

alter table public.articles enable row level security;
