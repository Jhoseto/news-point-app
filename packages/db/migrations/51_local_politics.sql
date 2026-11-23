-- Local politics: an empty, real editorial rubric. Apply manually after 50; no articles are fabricated.
insert into public.categories (slug, name, path, kind, in_menu, menu_order)
values ('mestna-politika', 'Местна политика', '/mestna-politika/', 'section', true, 3)
on conflict (slug) do update
set name = excluded.name, path = excluded.path, kind = 'section', in_menu = true, menu_order = 3;

update public.categories as c set menu_order = v.ord
from (values
  ('plovdiv', 1), ('regionalni-novini', 2), ('mestna-politika', 3),
  ('na-fokus', 4), ('glasat-na-istinata', 5), ('balgariya', 6),
  ('politika', 7), ('kriminalni-novini', 8), ('ot-soczialnite-mrezhi', 9),
  ('svetovni-novini', 10), ('sportni-novini', 11), ('tehnologii', 12),
  ('biznes-novini', 13), ('zdrave', 14), ('kultura', 15),
  ('lajfstajl', 16), ('izbori', 17)
) as v(slug, ord) where c.slug = v.slug and c.in_menu = true;
