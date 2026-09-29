/** Public rubrics, in menu order. Names shown instead of the imported WordPress labels. */
export const PUBLIC_MENU: readonly { slug: string; name: string }[] = [
  { slug: "plovdiv", name: "Пловдив" },
  { slug: "regionalni-novini", name: "Регион" },
  { slug: "balgariya", name: "България" },
  { slug: "politika", name: "Политика" },
  { slug: "kriminalni-novini", name: "Криминални" },
  { slug: "ot-soczialnite-mrezhi", name: "Анализи и коментари" },
  { slug: "svetovni-novini", name: "Свят" },
  { slug: "sportni-novini", name: "Спорт" },
  { slug: "tehnologii", name: "Технологии" },
  { slug: "biznes-novini", name: "Бизнес" },
  { slug: "zdrave", name: "Здраве" },
  { slug: "kultura", name: "Култура" },
  { slug: "lajfstajl", name: "Лайфстайл" },
  { slug: "izbori", name: "Избори" },
];

const bySlug = new Map(PUBLIC_MENU.map((entry) => [entry.slug, entry.name]));

/** Menu label for a rubric; other categories keep their stored name. */
export function menuName(slug: string, name: string): string {
  return bySlug.get(slug) ?? name;
}
