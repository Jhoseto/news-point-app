import "server-only";
import { loadPublicHome, type PublicHome } from "./public-home";
import type { ComposedSection } from "./home-compose";
import type { CategoryCursor } from "./category-pagination";
import { loadPublicCategory } from "./public-category";
import { getMenuCategories, type CategoryRef } from "./queries";
import { mobileRubrics, publicVersion, rubricMenuVersion } from "./mobile-rubric-nav";
import { mobileRubricFeedSchema, serializeFeedArticle, type MobileFeedContent, type MobileRubricFeed } from "./mobile-rubric-feed";

function envelope(canonicalPath: string, asOfMs: number, menu: CategoryRef[], feed: MobileFeedContent, nextChangeAt: number | null): MobileRubricFeed {
  return mobileRubricFeedSchema.parse({ schemaVersion: 1, canonicalPath, menuVersion: rubricMenuVersion(mobileRubrics(menu)),
    contentVersion: publicVersion(JSON.stringify(feed)), asOfMs, freshUntil: Math.min(asOfMs + 60_000, nextChangeAt ?? Infinity), feed });
}
function injectVoiceAfterBulgaria(main: ComposedSection[], voice: ComposedSection | null): ComposedSection[] {
  if (!voice) return main;
  const ordered: ComposedSection[] = [];
  for (const section of main) {
    ordered.push(section);
    if (section.category.slug === "balgariya") ordered.push(voice);
  }
  return ordered;
}

export function homeMobileFeed(home: PublicHome, menu: CategoryRef[]) {
  const sections = (items: PublicHome["main"]) => items.map(({ category, articles, layout, wide }) => ({ category, articles: articles.map(serializeFeedArticle), layout, wide }));
  const main = injectVoiceAfterBulgaria(home.main, home.voiceSection);
  return envelope("/", home.asOfMs, menu, { kind: "home", hero: home.hero ? serializeFeedArticle(home.hero) : null,
    support: home.support.map(serializeFeedArticle), main: sections(main), aside: sections(home.aside),
    focusCarousel: home.focusCarousel.map(serializeFeedArticle), topicsCarousel: home.topicsCarousel.map(serializeFeedArticle),
    voiceCarousel: [], poll: home.poll }, home.nextChangeAt);
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
