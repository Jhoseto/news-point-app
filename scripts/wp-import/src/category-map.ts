// DEC-005 (confirmed by Koce, 24.09.2026). Change here, then re-run the
// import; categories are upserted by WordPress id. WordPress slugs do not
// always match the names ("ot-soczialnite-mrezhi" is "Анализи и коментари").

export interface MenuEntry {
  slug: string;
  label: string;
}

export const MENU: readonly MenuEntry[] = [
  { slug: "plovdiv", label: "Пловдив" },
  { slug: "regionalni-novini", label: "Регион" },
  { slug: "balgariya", label: "България" },
  { slug: "politika", label: "Политика" },
  { slug: "kriminalni-novini", label: "Криминални" },
  { slug: "ot-soczialnite-mrezhi", label: "Анализи и коментари" },
  { slug: "svetovni-novini", label: "Свят" },
  { slug: "sportni-novini", label: "Спорт" },
  { slug: "biznes-novini", label: "Бизнес" },
  { slug: "zdrave", label: "Здраве" },
  { slug: "kultura", label: "Култура" },
  { slug: "lajfstajl", label: "Лайфстайл" },
  { slug: "izbori", label: "Избори" },
];

export const EDITORIAL_LABELS: ReadonlySet<string> = new Set([
  "posledni-novini",
  "novini",
  "na-fokus",
  "top-temi",
  "top-novina",
  "glasat-na-istinata",
]);

export interface CategoryPlacement {
  kind: "section" | "label";
  inMenu: boolean;
  menuOrder: number | null;
  displayName: string | null;
}

export function placeCategory(slug: string): CategoryPlacement {
  const menuIndex = MENU.findIndex((entry) => entry.slug === slug);
  if (menuIndex >= 0) {
    return { kind: "section", inMenu: true, menuOrder: menuIndex + 1, displayName: MENU[menuIndex]!.label };
  }
  return { kind: EDITORIAL_LABELS.has(slug) ? "label" : "section", inMenu: false, menuOrder: null, displayName: null };
}
