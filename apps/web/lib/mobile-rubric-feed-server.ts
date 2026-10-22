import "server-only";
import { HOME_CAROUSEL_COUNT } from "@newspoint/content";
import { loadPublicHome, type PublicHome } from "./public-home";
import type { ArticleSummary } from "./queries";
import type { CategoryCursor } from "./category-pagination";
import { loadPublicCategory } from "./public-category";
import { getMenuCategories, type CategoryRef } from "./queries";
import { mobileRubrics, publicVersion, rubricMenuVersion } from "./mobile-rubric-nav";
import { mobileRubricFeedSchema, serializeFeedArticle, reviveFeedArticle, type MobileFeedContent, type MobileRubricFeed } from "./mobile-rubric-feed";
import { carouselArticle } from "./carousel-article";

function serializeCarouselArticle(value: ArticleSummary) {
  // Match the existing mobile render projection *after* its responsive-image
  // reduction. Keep every card and its exact lite image, but do not send unused
  // excerpts/variant ladders in both the canonical model and preview payload.
  return serializeFeedArticle(carouselArticle(reviveFeedArticle(serializeFeedArticle(value))));
}

function envelope(canonicalPath: string, asOfMs: number, menu: CategoryRef[], feed: MobileFeedContent, nextChangeAt: number | null): MobileRubricFeed {
  const rubrics = mobileRubrics(menu.map(({ name, path }) => ({ name, path })));
  return mobileRubricFeedSchema.parse({ schemaVersion: 1, canonicalPath, menuVersion: rubricMenuVersion(rubrics),
    contentVersion: publicVersion(JSON.stringify(feed)), asOfMs, freshUntil: Math.min(asOfMs + 60_000, nextChangeAt ?? Infinity), rubrics, feed });
}
function latestCarouselArticles(home: PublicHome): ArticleSummary[] {
  const skip = new Set<string>();
  if (home.hero) skip.add(home.hero.id);
  for (const article of home.support) skip.add(article.id);
  return home.latest.filter((article) => !skip.has(article.id)).slice(0, HOME_CAROUSEL_COUNT);
}

export function homeMobileFeed(home: PublicHome, menu: CategoryRef[]) {
  const sections = (items: PublicHome["main"]) => items.map(({ category, articles, layout, wide }) => ({ category, articles: articles.map(serializeFeedArticle), layout, wide }));
  return envelope("/", home.asOfMs, menu, { kind: "home", hero: home.hero ? serializeFeedArticle(home.hero) : null,
    support: home.support.map(serializeFeedArticle), latestCarousel: latestCarouselArticles(home).map(serializeCarouselArticle),
    main: sections(home.main), aside: sections(home.aside),
    focusCarousel: home.focusCarousel.map(serializeCarouselArticle), topicsCarousel: home.topicsCarousel.map(serializeCarouselArticle),
    voiceCarousel: home.voiceCarousel.map(serializeCarouselArticle), poll: home.poll }, home.nextChangeAt);
}
export function categoryMobileFeed(
  category: CategoryRef,
  view: Awaited<ReturnType<typeof loadPublicCategory>>,
  cursor: CategoryCursor | null,
  path = category.path,
) {
  return envelope(path, view.asOfMs, view.menu, {
    kind: "category",
    category,
    articles: view.articles.map(serializeFeedArticle),
    previous: view.archive.previous,
    next: view.archive.next,
    anchored: view.archive.anchored,
    pageStrip: view.pageStrip,
    pagination: view.pagination,
  }, view.nextChangeAt);
}
export async function loadMobileRubricFeed(path: string): Promise<MobileRubricFeed | null> {
  const menu = await getMenuCategories();
  if (path === "/") return homeMobileFeed(await loadPublicHome(), menu);
  const category = menu.find(item => item.path === path);
  return category ? categoryMobileFeed(category, await loadPublicCategory(category, null), null) : null;
}
