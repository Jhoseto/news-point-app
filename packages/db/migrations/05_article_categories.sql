-- 05 Article to category links (an article can be in several sections and
-- labels). Requires 02, 04.
-- Safe to re-run.

create table if not exists public.article_categories (
  article_id   uuid not null references public.articles (id) on delete cascade,
  category_id  uuid not null references public.categories (id) on delete cascade,
  primary key (article_id, category_id)
);

create index if not exists article_categories_category_idx
  on public.article_categories (category_id, article_id);

alter table public.article_categories enable row level security;
