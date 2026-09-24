-- 02 Categories: sections (Пловдив, Спорт, ...) and editorial labels
-- (Последни новини, На фокус, ...). Requires 01.
-- Safe to re-run.

create table if not exists public.categories (
  id          uuid primary key default gen_random_uuid(),
  wp_id       integer unique,
  slug        text not null unique,
  name        text not null check (length(trim(name)) > 0),
  -- Exact original path, e.g. /plovdiv/
  path        text not null unique check (path ~ '^/[^?#]+/$'),
  kind        text not null default 'section' check (kind in ('section', 'label')),
  in_menu     boolean not null default false,
  menu_order  integer,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

drop trigger if exists categories_set_updated_at on public.categories;
create trigger categories_set_updated_at
  before update on public.categories
  for each row execute function public.set_updated_at();

-- Not exposed through the Supabase Data API; the app connects as table owner.
alter table public.categories enable row level security;
