/** Public rubrics, in menu order. Names shown instead of the imported WordPress labels. */
export const PUBLIC_MENU: readonly { slug: string; name: string }[] = [
  { slug: "plovdiv", name: "Пловдив" },
  { slug: "regionalni-novini", name: "Регион" },
  { slug: "na-fokus", name: "На Фокус" },
  { slug: "glasat-na-istinata", name: "Гласът на истината" },
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

/**
 * Temporary public hide list. Entries stay in PUBLIC_MENU (labels, Studio, direct URLs).
 * Clear a slug here to show the rubric again in nav and homepage.
 */
export const PUBLIC_MENU_TEMPORARILY_HIDDEN: ReadonlySet<string> = new Set(["izbori"]);

/** Public nav/homepage order without temporarily hidden rubrics. */
export function visiblePublicMenu(): readonly { slug: string; name: string }[] {
  return PUBLIC_MENU.filter((entry) => !PUBLIC_MENU_TEMPORARILY_HIDDEN.has(entry.slug));
}

const bySlug = new Map(PUBLIC_MENU.map((entry) => [entry.slug, entry.name]));

/** Menu label for a rubric; other categories keep their stored name. */
export function menuName(slug: string, name: string): string {
  return bySlug.get(slug) ?? name;
}
