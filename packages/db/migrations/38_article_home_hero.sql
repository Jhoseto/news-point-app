-- Koce applies this additive migration manually.
begin;
alter table article_revisions add column if not exists home_hero_position smallint
  check (home_hero_position between 1 and 4);
commit;
