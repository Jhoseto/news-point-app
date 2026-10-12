import "server-only";
import { loadPublicHome, type PublicHome } from "./public-home";
import { loadPublicCategory } from "./public-category";
import { getMenuCategories, type CategoryRef } from "./queries";
import { mobileRubrics, publicVersion, rubricMenuVersion } from "./mobile-rubric-nav";
import { mobileRubricFeedSchema, serializeFeedArticle, type MobileFeedContent, type MobileRubricFeed } from "./mobile-rubric-feed";

function envelope(canonicalPath: string, asOfMs: number, menu: CategoryRef[], feed: MobileFeedContent, nextChangeAt: number | null): MobileRubricFeed {
  return mobileRubricFeedSchema.parse({ schemaVersion: 1, canonicalPath, menuVersion: rubricMenuVersion(mobileRubrics(menu)),
    contentVersion: publicVersion(JSON.stringify(feed)), asOfMs, freshUntil: Math.min(asOfMs + 60_000, nextChangeAt ?? Infinity), feed });
}
export function homeMobileFeed(home: PublicHome, menu: CategoryRef[]) {
  const sections = (items: PublicHome["main"]) => items.map(({ category, articles, layout, wide }) => ({ category, articles: articles.map(serializeFeedArticle), layout, wide }));
  return envelope("/", home.asOfMs, menu, { kind: "home", hero: home.hero ? serializeFeedArticle(home.hero) : null,
    support: home.support.map(serializeFeedArticle), main: sections(home.main), aside: sections(home.aside),
    focusCarousel: home.focusCarousel.map(serializeFeedArticle), topicsCarousel: home.topicsCarousel.map(serializeFeedArticle),
    voiceCarousel: home.voiceCarousel.map(serializeFeedArticle), poll: home.poll }, home.nextChangeAt);
}
export function categoryMobileFeed(category: CategoryRef, view: Awaited<ReturnType<typeof loadPublicCategory>>, path = category.path) {
  return envelope(path, view.asOfMs, view.menu, { kind: "category", category, articles: view.articles.map(serializeFeedArticle),
    previous: view.archive.previous, next: view.archive.next, anchored: view.archive.anchored }, view.nextChangeAt);
}
export async function loadMobileRubricFeed(path: string): Promise<MobileRubricFeed | null> {
  const menu = await getMenuCategories();
  if (path === "/") return homeMobileFeed(await loadPublicHome(), menu);
  const category = menu.find(item => item.path === path);
  return category ? categoryMobileFeed(category, await loadPublicCategory(category, null)) : null;
}
