-- Keep every theme URL reserved for its owner. Koce applies this manually.
begin;

create table story_theme_slugs (
  slug text primary key,
  theme_id uuid not null references story_themes(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index story_theme_slugs_theme_idx on story_theme_slugs(theme_id);
insert into story_theme_slugs(slug, theme_id) select slug, id from story_themes;

-- The primary key protects against concurrent rename/create operations too.
-- AFTER runs with the parent row present; a conflict rolls back the whole write.
create function reserve_story_theme_slug() returns trigger language plpgsql as $$
begin
  insert into public.story_theme_slugs(slug, theme_id) values (new.slug, new.id)
    on conflict (slug) do update set theme_id = excluded.theme_id
    where public.story_theme_slugs.theme_id = excluded.theme_id;
  if not found then
    raise exception 'Theme URL already reserved' using errcode = '23505', constraint = 'story_theme_slugs_pkey';
  end if;
  return new;
end;
$$;
create trigger story_theme_slug_reservation
  after insert or update of slug on story_themes
  for each row execute function reserve_story_theme_slug();

commit;
