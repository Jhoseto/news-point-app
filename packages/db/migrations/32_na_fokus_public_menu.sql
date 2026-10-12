-- 32 „На Фокус“ as a public menu rubric (archive at /na-fokus/).
-- Syncs menu_order with packages/content PUBLIC_MENU. Safe to re-run. Requires 02.

update public.categories
set kind = 'section', name = 'На Фокус', in_menu = true
where slug = 'na-fokus';

update public.categories set in_menu = false, menu_order = null;

update public.categories as c
set name = v.name, in_menu = true, menu_order = v.ord
from (values
  ('plovdiv', 'Пловдив', 1),
  ('regionalni-novini', 'Регион', 2),
  ('na-fokus', 'На Фокус', 3),
  ('glasat-na-istinata', 'Гласът на истината', 4),
  ('balgariya', 'България', 5),
  ('politika', 'Политика', 6),
  ('kriminalni-novini', 'Криминални', 7),
  ('ot-soczialnite-mrezhi', 'Анализи и коментари', 8),
  ('svetovni-novini', 'Свят', 9),
  ('sportni-novini', 'Спорт', 10),
  ('tehnologii', 'Технологии', 11),
  ('biznes-novini', 'Бизнес', 12),
  ('zdrave', 'Здраве', 13),
  ('kultura', 'Култура', 14),
  ('lajfstajl', 'Лайфстайл', 15),
  ('izbori', 'Избори', 16)
) as v(slug, name, ord)
where c.slug = v.slug;
