import {
  SHINE_CYCLE_MIN_S,
  SHINE_CYCLE_TAIL_S,
  SHINE_SECTION_GAP_MAX_S,
  SHINE_SECTION_GAP_MIN_S,
  SHINE_STAGGER_S,
  type HomeShineAllocator,
} from "./home-shine";
import type { ArticleSummary } from "./queries";

type Layout = "grid" | "feature";

function sectionCount(layout: Layout, wide: boolean) {
  return wide ? 7 : layout === "grid" ? 5 : 4;
}

/** Shine slots per category block (must match CategorySection card order). */
export function categoryShineSlotCount(articles: ArticleSummary[], layout: Layout, wide: boolean) {
  if (!articles.length) return 0;
  const [, ...rest] = articles;
  const mosaic = articles.length >= sectionCount("grid", wide);
  if (layout === "feature") return 1 + rest.length;
  if (!mosaic) return Math.min(4, articles.length);
  return 2 + rest.length;
}

/** Cycle length so the last homepage card still gets a visible sweep (after carousel). */
export function estimateHomeShineCycleSec(
  shine: HomeShineAllocator,
  sections: { articles: ArticleSummary[]; layout: Layout; wide: boolean }[],
  asideArticleCounts: number[],
) {
  let slots = 0;
  let breaks = sections.length + asideArticleCounts.length;
  for (const section of sections) {
    slots += categoryShineSlotCount(section.articles, section.layout, section.wide);
  }
  for (const count of asideArticleCounts) {
    slots += count;
  }
  const gapMid = (SHINE_SECTION_GAP_MIN_S + SHINE_SECTION_GAP_MAX_S) / 2;
  const projectedMax = shine.maxDelaySec() + breaks * gapMid + slots * SHINE_STAGGER_S;
  return Math.max(SHINE_CYCLE_MIN_S, projectedMax + SHINE_CYCLE_TAIL_S);
}
