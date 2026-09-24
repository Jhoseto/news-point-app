// DEC-005 (proposed, awaiting Koce's review). Change here, then re-run the
// import; categories are upserted by WordPress id.

export interface MenuEntry {
  slug: string;
  label: string;
}

export const MENU: readonly MenuEntry[] = [
  { slug: "balgariya", label: "България" },
  { slug: "plovdiv", label: "Пловдив" },
  { slug: "svetovni-novini", label: "Свят" },
  { slug: "politika", label: "Политика" },
  { slug: "biznes-novini", label: "Икономика" },
  { slug: "sportni-novini", label: "Спорт" },
  { slug: "lajfstajl", label: "Любопитно" },
  { slug: "kultura", label: "Култура" },
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
