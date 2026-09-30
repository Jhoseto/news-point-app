import { z } from "zod";

/** Home and category pages keep this grid. Editors only choose which story fills a slot. */
export const HOME_PAGE_KEY = "home";
export const HOME_LEAD_SECTION = "plovdiv";
/** Same stack as the homepage column beside България (Култура, then Лайфстайл). */
export const HOME_ASIDE_SECTIONS = ["kultura", "lajfstajl"] as const;
export const HOME_SUPPORT_COUNT = 3;
export const HOME_CAROUSEL_COUNT = 10;
/** Slot keys `carousel-0` … for the „На Фокус“ row (legacy prefix). */
export const HOME_FOCUS_CAROUSEL_PREFIX = "carousel";
/** Slot keys `top-temi-0` … for the „Топ теми“ row. */
export const HOME_TOP_THEMES_CAROUSEL_PREFIX = "top-temi";
/** Slot keys `glasat-0` … for „Гласът на истината“. */
export const HOME_VOICE_CAROUSEL_PREFIX = "glasat";

export const HOME_CAROUSEL_SLOT_PREFIXES = [
  HOME_FOCUS_CAROUSEL_PREFIX,
  HOME_TOP_THEMES_CAROUSEL_PREFIX,
  HOME_VOICE_CAROUSEL_PREFIX,
] as const;

export type HomeCarouselSlotPrefix = (typeof HOME_CAROUSEL_SLOT_PREFIXES)[number];

export function homeCarouselSlotKey(prefix: HomeCarouselSlotPrefix, index: number): string {
  return `${prefix}-${index}`;
}

export function homeCarouselSlotPrefix(key: string): HomeCarouselSlotPrefix | null {
  for (const prefix of HOME_CAROUSEL_SLOT_PREFIXES) {
    if (key === prefix || key.startsWith(`${prefix}-`)) return prefix;
  }
  return null;
}
export const HOME_LATEST_PIN_COUNT = 3;
export const HOME_BAND_COUNT = 13;
export const CATEGORY_NEXT_COUNT = 6;
export const ARRANGEMENT_QUEUE_LIMIT = 5;

const asideSet = new Set<string>(HOME_ASIDE_SECTIONS);

export const arrangementItemSchema = z.object({
  articleId: z.uuid(),
  startsAt: z.string().nullable(),
  endsAt: z.string().nullable(),
  placedBy: z.string().max(120).default(""),
  placedAt: z.string().nullable().default(null),
}).strict();

export const arrangementSlotSchema = z.object({
  items: z.array(arrangementItemSchema).max(1 + ARRANGEMENT_QUEUE_LIMIT),
}).strict();

export const arrangementDocumentSchema = z.object({
  slots: z.record(z.string().max(80), arrangementSlotSchema),
  excluded: z.array(z.uuid()).max(80),
}).strict();

export type ArrangementItem = z.infer<typeof arrangementItemSchema>;
export type ArrangementSlot = z.infer<typeof arrangementSlotSchema>;
export type ArrangementDocument = z.infer<typeof arrangementDocumentSchema>;

export const emptyArrangement = (): ArrangementDocument => ({ slots: {}, excluded: [] });

export interface HomeSectionPlan {
  slug: string;
  name: string;
  count: number;
  layout: "grid" | "feature" | "list";
  wide: boolean;
  aside: boolean;
}

export function homeSectionCount(layout: "grid" | "feature" | "list", wide: boolean): number {
  if (layout === "list") return 4;
  return wide ? 7 : layout === "grid" ? 5 : 4;
}

/** Same section order and card counts the public homepage already renders. */
export function planHomeSections(categories: { slug: string; name: string }[]): { main: HomeSectionPlan[]; aside: HomeSectionPlan[] } {
  const flow = categories.filter((category) => !asideSet.has(category.slug));
  const main = flow.map((category, index): HomeSectionPlan => {
    if (category.slug === HOME_LEAD_SECTION) {
      return { slug: category.slug, name: category.name, layout: "grid", wide: true, aside: false, count: homeSectionCount("grid", true) };
    }
    if (category.slug === "balgariya") {
      return { slug: category.slug, name: category.name, layout: "grid", wide: false, aside: false, count: homeSectionCount("grid", false) };
    }
    const layout = index % 2 === 1 ? "feature" : "grid";
    return { slug: category.slug, name: category.name, layout, wide: true, aside: false, count: homeSectionCount(layout, true) };
  });
  const aside = HOME_ASIDE_SECTIONS.flatMap((slug) => {
    const category = categories.find((item) => item.slug === slug);
    if (!category) return [];
    return [{
      slug: category.slug,
      name: category.name,
      layout: "list" as const,
      wide: false,
      aside: true,
      count: 4,
    }];
  });
  return { main, aside };
}

export function sectionSlotKey(slug: string, index: number): string {
  return `section:${slug}:${index}`;
}

export interface SlotLabel {
  key: string;
  group: string;
  label: string;
}

export function homeSlotCatalog(categories: { slug: string; name: string }[]): SlotLabel[] {
  const slots: SlotLabel[] = [
    { key: "hero", group: "Водеща лента", label: "Водеща" },
    { key: "support-0", group: "Водеща лента", label: "До водещата — голяма" },
    { key: "support-1", group: "Водеща лента", label: "До водещата — лява малка" },
    { key: "support-2", group: "Водеща лента", label: "До водещата — дясна малка" },
  ];
  for (let index = 0; index < HOME_CAROUSEL_COUNT; index += 1) {
    slots.push({ key: homeCarouselSlotKey(HOME_FOCUS_CAROUSEL_PREFIX, index), group: "На Фокус", label: `Място ${index + 1}` });
  }
  for (let index = 0; index < HOME_CAROUSEL_COUNT; index += 1) {
    slots.push({ key: homeCarouselSlotKey(HOME_TOP_THEMES_CAROUSEL_PREFIX, index), group: "Топ теми", label: `Място ${index + 1}` });
  }
  for (let index = 0; index < HOME_CAROUSEL_COUNT; index += 1) {
    slots.push({ key: homeCarouselSlotKey(HOME_VOICE_CAROUSEL_PREFIX, index), group: "Гласът на истината", label: `Място ${index + 1}` });
  }
  for (let index = 0; index < HOME_LATEST_PIN_COUNT; index += 1) {
    slots.push({ key: `latest-${index}`, group: "Последни", label: `Отгоре ${index + 1}` });
  }
  const planned = planHomeSections(categories);
  for (const section of [...planned.main, ...planned.aside]) {
    for (let index = 0; index < section.count; index += 1) {
      const label = section.aside ? `Ред ${index + 1}` : index === 0 ? "Голяма карта" : `Малка ${index}`;
      slots.push({ key: sectionSlotKey(section.slug, index), group: section.name, label });
    }
  }
  return slots;
}

export function categorySlotCatalog(): SlotLabel[] {
  const slots: SlotLabel[] = [{ key: "lead", group: "Първа страница", label: "Голяма карта" }];
  for (let index = 0; index < CATEGORY_NEXT_COUNT; index += 1) {
    slots.push({ key: `next-${index}`, group: "Първа страница", label: `Следваща ${index + 1}` });
  }
  return slots;
}

export function allowedSlotKeys(pageKey: string, categories: { slug: string; name: string }[]): Set<string> {
  const catalog = pageKey === HOME_PAGE_KEY ? homeSlotCatalog(categories) : categorySlotCatalog();
  return new Set(catalog.map((slot) => slot.key));
}

function validInstant(value: string | null): boolean {
  return value === null || Number.isFinite(Date.parse(value));
}

/** Drops unknown slots and items whose clock values cannot be read. */
export function sanitizeArrangement(pageKey: string, document: ArrangementDocument, categories: { slug: string; name: string }[]): ArrangementDocument {
  const allowed = allowedSlotKeys(pageKey, categories);
  const slots: ArrangementDocument["slots"] = {};
  for (const [key, slot] of Object.entries(document.slots)) {
    if (!allowed.has(key)) continue;
    const items = slot.items.filter((item) => validInstant(item.startsAt) && validInstant(item.endsAt) && (item.endsAt === null || item.startsAt === null || Date.parse(item.startsAt) < Date.parse(item.endsAt)));
    if (items.length) slots[key] = { items };
  }
  return { slots, excluded: [...new Set(document.excluded)] };
}

/**
 * First queued story whose window contains `now` and which is still public.
 * A future start holds the slot empty. After the current story ends, the next one takes the same place.
 */
export function activePlacement(slot: ArrangementSlot | undefined, now: number, visible: ReadonlySet<string>): ArrangementItem | null {
  if (!slot) return null;
  for (const item of slot.items) {
    if (item.startsAt && Date.parse(item.startsAt) > now) return null;
    const ended = item.endsAt !== null && Date.parse(item.endsAt) <= now;
    if (!visible.has(item.articleId) || ended) continue;
    return item;
  }
  return null;
}

export function duplicateArticleIds(document: ArrangementDocument, now: number, visible: ReadonlySet<string>): string[] {
  const counts = new Map<string, number>();
  for (const slot of Object.values(document.slots)) {
    const active = activePlacement(slot, now, visible);
    if (!active) continue;
    counts.set(active.articleId, (counts.get(active.articleId) ?? 0) + 1);
  }
  return [...counts].filter(([, count]) => count > 1).map(([id]) => id);
}

export function referencedArticleIds(document: ArrangementDocument): string[] {
  const ids = new Set<string>(document.excluded);
  for (const slot of Object.values(document.slots)) {
    for (const item of slot.items) ids.add(item.articleId);
  }
  return [...ids];
}
