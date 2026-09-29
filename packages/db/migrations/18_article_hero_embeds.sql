-- Optional external hero embed URL for Studio articles. Koce applies migrations manually.
alter table articles add column if not exists hero_embed_url text;
alter table article_revisions add column if not exists hero_embed_url text;

alter table articles add constraint articles_hero_embed_https_chk
  check (hero_embed_url is null or hero_embed_url ~ '^https://');
alter table article_revisions add constraint article_revisions_hero_embed_https_chk
  check (hero_embed_url is null or hero_embed_url ~ '^https://');
