-- 09 Public menu: the rubrics Koce asked for, in this order.
-- Renames three imported labels (Регионални, Икономика, Любопитно).
-- Adds Технологии; it does not exist on the old site, so it starts empty.
-- Safe to re-run. Requires 02.

insert into public.categories (slug, name, path, kind, in_menu, menu_order)
values ('tehnologii', 'Технологии', '/tehnologii/', 'section', true, 9)
on conflict (slug) do update
  set name = excluded.name, path = excluded.path, kind = 'section', in_menu = true, menu_order = 9;

update public.categories set in_menu = false, menu_order = null;

update public.categories as c
set name = v.name, in_menu = true, menu_order = v.ord
from (values
  ('plovdiv', 'Пловдив', 1),
  ('regionalni-novini', 'Регион', 2),
  ('balgariya', 'България', 3),
  ('politika', 'Политика', 4),
  ('kriminalni-novini', 'Криминални', 5),
  ('ot-soczialnite-mrezhi', 'Анализи и коментари', 6),
  ('svetovni-novini', 'Свят', 7),
  ('sportni-novini', 'Спорт', 8),
  ('tehnologii', 'Технологии', 9),
  ('biznes-novini', 'Бизнес', 10),
  ('zdrave', 'Здраве', 11),
  ('kultura', 'Култура', 12),
  ('lajfstajl', 'Лайфстайл', 13),
  ('izbori', 'Избори', 14)
) as v(slug, name, ord)
where c.slug = v.slug;
