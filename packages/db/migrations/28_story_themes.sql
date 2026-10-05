-- Story themes (Теми с продължение). Each theme is an editor-curated
-- sequence of published articles; the public timeline renders the order set
-- here. We mirror the shape of page_arrangements (one published + one draft
-- per slug) and article_categories (cascade + many-to-many).

begin;

create table if not exists story_themes (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  title text not null,
  summary text not null default '',
  intro text not null default '',
  cover_media_id uuid references media_assets(id) on delete set null,
  cover_caption text not null default '',
  is_published boolean not null default false,
  published_at timestamptz,
  created_by text references staff_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index story_themes_slug_key on story_themes(slug);
create unique index story_themes_published_slug_key
  on story_themes(slug) where is_published;
create index story_themes_published_idx
  on story_themes(published_at desc) where is_published;

create table if not exists story_theme_articles (
  theme_id uuid not null references story_themes(id) on delete cascade,
  article_id uuid not null references articles(id) on delete cascade,
  position int not null check (position >= 1),
  added_at timestamptz not null default now(),
  added_by text references staff_users(id) on delete set null,
  primary key (theme_id, article_id)
);

create index story_theme_articles_theme_position_idx
  on story_theme_articles(theme_id, position);

create index story_theme_articles_article_idx
  on story_theme_articles(article_id);

-- Outbox constraint is replaced in-place so old rows survive.
alter table outbox_events drop constraint if exists outbox_events_type_check;
alter table outbox_events add constraint outbox_events_type_check
  check (type in ('article.published','article.updated','layout.updated','story.published','story.updated'));

commit;
