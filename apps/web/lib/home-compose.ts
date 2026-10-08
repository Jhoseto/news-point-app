import {
  HOME_BAND_COUNT,
  HOME_CAROUSEL_COUNT,
  HOME_LATEST_PIN_COUNT,
  HOME_SUPPORT_COUNT,
  activePlacement,
  planHomeSections,
  sectionSlotKey,
  type ArrangementDocument,
} from "@newspoint/content";
import { UniquePicker } from "./pick";
import type { ArticleSummary, CategoryRef } from "./queries";

export interface HomeSectionInput {
  category: CategoryRef;
  pool: ArticleSummary[];
}

export interface ComposedSection extends HomeSectionInput {
  layout: "grid" | "feature" | "list";
  wide: boolean;
  articles: ArticleSummary[];
}

export interface ComposedHome {
  hero: ArticleSummary | undefined;
  support: ArticleSummary[];
  carousel: ArticleSummary[];
  latest: ArticleSummary[];
  main: ComposedSection[];
  aside: ComposedSection[];
}

function resolveSlot(document: ArrangementDocument, key: string, now: number, visible: ReadonlySet<string>, byId: Map<string, ArticleSummary>): ArticleSummary | null {
  const item = activePlacement(document.slots[key], now, visible);
  return item ? byId.get(item.articleId) ?? null : null;
}

function fillPinned(picker: UniquePicker, pool: ArticleSummary[], count: number, pins: Array<ArticleSummary | null>, excluded: ReadonlySet<string>): ArticleSummary[] {
  const articles: ArticleSummary[] = [];
  let index = 0;
  for (let slot = 0; slot < count; slot += 1) {
    let article = picker.claim(pins[slot]);
    while (!article && index < pool.length) {
      const candidate = pool[index];
      index += 1;
      if (!candidate || excluded.has(candidate.id)) continue;
      article = picker.claim(candidate);
    }
    if (article) articles.push(article);
  }
  return articles;
}

/** Places editorial stories into the existing homepage slots. An empty document matches the automatic fill. */
export function composeHome(input: {
  latest: ArticleSummary[];
  latest24h: ArticleSummary[];
  featured: ArticleSummary[];
  sections: HomeSectionInput[];
  menuIds: ReadonlySet<string>;
  pinned: Map<string, ArticleSummary>;
  document: ArrangementDocument;
  now: number;
}): ComposedHome {
  const { latest, latest24h, featured, sections, menuIds, pinned, document, now } = input;
  const visible = new Set(pinned.keys());
  const excluded = new Set(document.excluded);
  const slot = (key: string) => resolveSlot(document, key, now, visible, pinned);
  const picker = new UniquePicker();
  const heroPool = latest.filter((article) => article.category && menuIds.has(article.category.id));
  const hero = picker.claim(slot("hero")) ?? picker.take(heroPool.filter((article) => !excluded.has(article.id)), 1)[0];

  // „На Фокус“ carousel slots are filled only via composeLabelCarousel — not the hero band pool.
  const bandPins = [
    ...Array.from({ length: HOME_SUPPORT_COUNT }, (_, index) => slot(`support-${index}`)),
    ...Array.from({ length: HOME_CAROUSEL_COUNT }, () => null),
  ];
  const band = fillPinned(picker, [...featured, ...latest], HOME_BAND_COUNT, bandPins, excluded);
  const support = band.slice(0, HOME_SUPPORT_COUNT);
  const carousel = band.slice(HOME_SUPPORT_COUNT, HOME_SUPPORT_COUNT + HOME_CAROUSEL_COUNT);

  // Category sections use a separate picker so a story that already leads the page
  // (hero / support / carousel) can still lead its own rubric block.
  const sectionPicker = new UniquePicker();
  const planned = planHomeSections(sections.map((section) => section.category));
  const bySlug = new Map(sections.map((section) => [section.category.slug, section]));
  const fillSection = (plan: (typeof planned.main)[number]): ComposedSection | null => {
    const section = bySlug.get(plan.slug);
    if (!section) return null;
    const pins = Array.from({ length: plan.count }, (_, index) => slot(sectionSlotKey(plan.slug, index)));
    return { ...section, layout: plan.layout, wide: plan.wide, articles: fillPinned(sectionPicker, section.pool, plan.count, pins, excluded) };
  };
  const main = planned.main.flatMap((plan) => {
    const filled = fillSection(plan);
    return filled ? [filled] : [];
  });
  const aside = planned.aside.flatMap((plan) => {
    const filled = fillSection(plan);
    return filled ? [filled] : [];
  });

  const latestPins: ArticleSummary[] = [];
  for (let index = 0; index < HOME_LATEST_PIN_COUNT; index += 1) {
    const article = slot(`latest-${index}`);
    if (article && !latestPins.some((pin) => pin.id === article.id)) latestPins.push(article);
  }
  const pinIds = new Set(latestPins.map((article) => article.id));

  return {
    hero,
    support,
    carousel,
    latest: [...latestPins, ...latest24h.filter((article) => !pinIds.has(article.id))],
    main,
    aside,
  };
}

/** Homepage label carousels (На Фокус, …): first rows follow arrangement slots, then the rest of the pool. */
export function composeLabelCarousel(input: {
  pool: ArticleSummary[];
  document: ArrangementDocument;
  pinned: Map<string, ArticleSummary>;
  now: number;
  slotPrefix?: string;
  slotCount?: number;
  maxArticles?: number;
}): ArticleSummary[] {
  const slotCount = input.slotCount ?? HOME_CAROUSEL_COUNT;
  const maxArticles = input.maxArticles ?? 50;
  const slotPrefix = input.slotPrefix ?? "carousel";
  const { pool, document, pinned, now } = input;
  const visible = new Set(pinned.keys());
  const excluded = new Set(document.excluded);
  const slot = (key: string) => resolveSlot(document, key, now, visible, pinned);
  const picker = new UniquePicker();
  const pins = Array.from({ length: slotCount }, (_, index) => slot(`${slotPrefix}-${index}`));
  const head = fillPinned(picker, pool, slotCount, pins, excluded);
  const used = new Set(head.map((article) => article.id));
  const tail = pool.filter((article) => !used.has(article.id) && !excluded.has(article.id));
  return [...head, ...tail].slice(0, maxArticles);
}
