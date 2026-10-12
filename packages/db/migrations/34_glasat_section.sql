-- 34 „Гласът на истината“ as a section so Studio can assign it as primary rubric.
-- Safe to re-run. Requires 02.

update public.categories
set kind = 'section',
    name = 'Гласът на истината',
    in_menu = true
where slug = 'glasat-na-istinata';
