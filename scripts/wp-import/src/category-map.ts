// DEC-005 (proposed, awaiting Koce's review). Change here, then re-run the
// import; categories are upserted by WordPress id.

export interface MenuEntry {
  slug: string;
  label: string;
}

// Same order and labels as apps/web/lib/menu.ts. "tehnologii" is not on the old
// site; migration 09 inserts it, and a later import leaves it alone.
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
