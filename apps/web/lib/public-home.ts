import "server-only";
import { unstable_cache } from "next/cache";
import { cache } from "react";
import { HOME_TOP_THEMES_CAROUSEL_PREFIX, HOME_VOICE_CAROUSEL_PREFIX } from "@newspoint/content";
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

function reviveSection(section: ComposedSection): ComposedSection {
  return { ...section, articles: section.articles.map(reviveArticle) };
}

function reviveHome(home: PublicHome): PublicHome {
  return {
    ...home,
    hero: home.hero ? reviveArticle(home.hero) : undefined,
    support: home.support.map(reviveArticle),
    latest: home.latest.map(reviveArticle),
    main: home.main.map(reviveSection),
    aside: home.aside.map(reviveSection),
    focusCarousel: home.focusCarousel.map(reviveArticle),
    topicsCarousel: home.topicsCarousel.map(reviveArticle),
    voiceCarousel: home.voiceCarousel.map(reviveArticle),
  };
}

async function queryPublicHome(): Promise<PublicHome> {
  const asOfMs = publicAsOfMs();
  const [latest, latest24h, featured, focusPool, topics, voiceOfTruth, menu, poll, placed] = await Promise.all([
    getLatest(50),
    getLatest24Hours(asOfMs),
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
  const menuIds = new Set(menu.map((category) => category.id));
  const composed = composeHome({
    latest,
    latest24h,
    featured,
    sections,
    menuIds,
    pinned: placed.pinned,
    document: placed.document,
    now: asOfMs,
  });
  return {
    asOfMs,
    hero: composed.hero,
    support: composed.support,
    latest: composed.latest,
    main: composed.main,
    aside: composed.aside,
    focusCarousel: composeLabelCarousel({
      pool: focusPool,
      document: placed.document,
      pinned: placed.pinned,
      now: asOfMs,
    }),
    topicsCarousel: composeLabelCarousel({
      pool: topics,
      document: placed.document,
      pinned: placed.pinned,
      now: asOfMs,
      slotPrefix: HOME_TOP_THEMES_CAROUSEL_PREFIX,
    }),
    voiceCarousel: composeLabelCarousel({
      pool: voiceOfTruth,
      document: placed.document,
      pinned: placed.pinned,
      now: asOfMs,
      slotPrefix: HOME_VOICE_CAROUSEL_PREFIX,
    }),
    poll,
  };
}

const readPublicHome = unstable_cache(queryPublicHome, ["public-home"], { revalidate: 60, tags: ["public-listings"] });

/** One cached homepage snapshot. The page render does not call Date.now() or uncached IO. */
export const loadPublicHome = cache(async (): Promise<PublicHome> => reviveHome(await readPublicHome()));
