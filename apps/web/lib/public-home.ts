import "server-only";
import { unstable_cache } from "next/cache";
import { cache } from "react";
import { HOME_TOP_THEMES_CAROUSEL_PREFIX, HOME_VOICE_CAROUSEL_PREFIX, nextArrangementChangeAt } from "@newspoint/content";
import { featuredPoll } from "@newspoint/db/polls";
import type { PublicPoll } from "@newspoint/db/poll-types";
import { homeArrangement } from "./front-page";
import { composeHome, composeLabelCarousel, type ComposedSection } from "./home-compose";
import { getByCategory, getLabelled, getLatest, getLatest24Hours, getMenuCategories, publicAsOfMs, type ArticleSummary } from "./queries";

const LEADING_LABEL = "novini";
const FOCUS_LABEL = "na-fokus";
const TOP_THEMES_LABEL = "top-temi";
const VOICE_OF_TRUTH_LABEL = "glasat-na-istinata";

export interface PublicHome {
  asOfMs: number;
  nextChangeAt: number | null;
  hero: ArticleSummary | undefined;
  support: ArticleSummary[];
  latest: ArticleSummary[];
  main: ComposedSection[];
  aside: ComposedSection[];
  focusCarousel: ArticleSummary[];
  topicsCarousel: ArticleSummary[];
  voiceCarousel: ArticleSummary[];
  poll: PublicPoll | null;
}

function reviveArticle(article: ArticleSummary): ArticleSummary {
  return article.publishedAt instanceof Date ? article : { ...article, publishedAt: new Date(article.publishedAt) };
}

async function queryPublicHomeInputs() {
  const [latest, featured, focusPool, topics, voiceOfTruth, menu, poll, placed] = await Promise.all([
    getLatest(50),
    getLabelled(LEADING_LABEL, 13),
    getLabelled(FOCUS_LABEL, 50),
    getLabelled(TOP_THEMES_LABEL, 50),
    getLabelled(VOICE_OF_TRUTH_LABEL, 50),
    getMenuCategories(),
    featuredPoll().catch((error: unknown) => {
      console.error("[polls] homepage unavailable", error instanceof Error ? error.message : "unknown");
      return null;
    }),
    homeArrangement(),
  ]);
  const sections = await Promise.all(menu.map(async (category) => ({ category, pool: await getByCategory(category.id, 16) })));
  return { latest, featured, focusPool, topics, voiceOfTruth, menu, poll, sections,
    document: placed.document, pinned: [...placed.pinned] };
}

const readPublicHomeInputs = unstable_cache(queryPublicHomeInputs, ["public-home-inputs"], { revalidate: 60, tags: ["public-listings"] });

/** Cache the source pools, but evaluate placement windows against this request's clock. */
export const loadPublicHome = cache(async (): Promise<PublicHome> => {
  const now = Date.now();
  const asOfMs = publicAsOfMs(now);
  const [input, latest24h] = await Promise.all([readPublicHomeInputs(), getLatest24Hours(asOfMs)]);
  const revive = (items: ArticleSummary[]) => items.map(reviveArticle);
  const { menu, poll, document } = input;
  const latest = revive(input.latest), featured = revive(input.featured), focusPool = revive(input.focusPool);
  const topics = revive(input.topics), voiceOfTruth = revive(input.voiceOfTruth);
  const sections = input.sections.map((section) => ({ ...section, pool: revive(section.pool) }));
  const pinned = new Map(input.pinned.map(([id, article]) => [id, reviveArticle(article)]));
  const menuIds = new Set(menu.map((category) => category.id));
  const composed = composeHome({
    latest,
    latest24h,
    featured,
    sections,
    menuIds,
    pinned,
    document,
    now,
  });
  return {
    asOfMs,
    nextChangeAt: nextArrangementChangeAt(document, now, new Set(pinned.keys())),
    hero: composed.hero,
    support: composed.support,
    latest: composed.latest,
    main: composed.main,
    aside: composed.aside,
    focusCarousel: composeLabelCarousel({
      pool: focusPool,
      document,
      pinned,
      now,
    }),
    topicsCarousel: composeLabelCarousel({
      pool: topics,
      document,
      pinned,
      now,
      slotPrefix: HOME_TOP_THEMES_CAROUSEL_PREFIX,
    }),
    voiceCarousel: composeLabelCarousel({
      pool: voiceOfTruth,
      document,
      pinned,
      now,
      slotPrefix: HOME_VOICE_CAROUSEL_PREFIX,
    }),
    poll,
  };
});
