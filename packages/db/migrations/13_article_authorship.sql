-- D1-1: public article byline, kept separate from the staff audit actor.
-- Koce applies manually. Safe to re-run; legacy WordPress content remains NewsPoint.bg.
begin;

alter table public.articles
  add column if not exists author_kind text,
  add column if not exists author_user_id text references public.staff_users(id) on delete set null;

-- Existing WordPress content never carried a reliable personal author.
update public.articles
set author_name = 'NewsPoint.bg', author_kind = 'newsroom', author_user_id = null
where source_system = 'wordpress';

-- Studio has so far defaulted author_name to the creator's current profile name.
update public.articles a
set author_kind = 'staff', author_user_id = a.created_by
where a.source_system = 'studio'
  and a.created_by is not null
  and exists (
    select 1 from public.staff_users u
    where u.id = a.created_by and u.name = a.author_name
  );

update public.articles
set author_kind = case when author_name = 'NewsPoint.bg' then 'newsroom' else 'manual' end,
    author_user_id = null
where author_kind is null;

alter table public.article_revisions
  add column if not exists author_kind text,
  add column if not exists author_user_id text references public.staff_users(id) on delete set null,
  add column if not exists author_name text;

-- Authorship was not editable before this migration, so the article snapshot is
-- the only truthful backfill for all of its existing revisions.
update public.article_revisions r
set author_kind = a.author_kind,
    author_user_id = a.author_user_id,
    author_name = a.author_name
from public.articles a
where a.id = r.article_id
  and (r.author_kind is null or r.author_name is null);

alter table public.articles
  alter column author_kind set default 'newsroom',
  alter column author_kind set not null;

alter table public.article_revisions
  alter column author_kind set default 'newsroom',
  alter column author_kind set not null,
  alter column author_name set default 'NewsPoint.bg',
  alter column author_name set not null;

alter table public.articles drop constraint if exists articles_author_attribution_check;
alter table public.articles add constraint articles_author_attribution_check check (
  author_kind in ('staff', 'newsroom', 'manual')
  and char_length(author_name) between 2 and 120
  and author_name = btrim(author_name)
  and author_name !~ '[[:cntrl:]]'
  and (
    (author_kind = 'staff')
    or (author_kind = 'newsroom' and author_user_id is null and author_name = 'NewsPoint.bg')
    or (author_kind = 'manual' and author_user_id is null)
  )
);

alter table public.article_revisions drop constraint if exists article_revisions_author_attribution_check;
alter table public.article_revisions add constraint article_revisions_author_attribution_check check (
  author_kind in ('staff', 'newsroom', 'manual')
  and char_length(author_name) between 2 and 120
  and author_name = btrim(author_name)
  and author_name !~ '[[:cntrl:]]'
  and (
    (author_kind = 'staff')
    or (author_kind = 'newsroom' and author_user_id is null and author_name = 'NewsPoint.bg')
    or (author_kind = 'manual' and author_user_id is null)
  )
);

create index if not exists articles_public_author_idx
  on public.articles (author_user_id, published_at desc, id desc)
  where is_public and author_kind = 'staff';

-- Public presentation data is isolated from authentication/account fields.
create table if not exists public.author_profiles (
  staff_user_id text primary key references public.staff_users(id) on delete cascade,
  slug text not null unique,
  bio text not null default '',
  avatar_media_id uuid references public.media_assets(id) on delete set null,
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint author_profiles_slug_check check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint author_profiles_bio_check check (char_length(bio) <= 1500)
);

drop trigger if exists author_profiles_set_updated_at on public.author_profiles;
create trigger author_profiles_set_updated_at before update on public.author_profiles
  for each row execute function public.set_updated_at();

alter table public.author_profiles enable row level security;

commit;
