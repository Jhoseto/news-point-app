import "server-only";
import { unstable_cache } from "next/cache";
import { categoryFront } from "./front-page";
import { CATEGORY_PAGE_SIZE, type CategoryCursor } from "./category-pagination";
import { getCategoryArchive, getMenuCategories, getLatest24Hours, publicAsOfMs, type ArticleSummary, type CategoryRef } from "./queries";

const readCategoryView = unstable_cache(async (category: CategoryRef, cursor: CategoryCursor | null, skipIds: string[], limit: number) => {
  const [archive, menu] = await Promise.all([
    getCategoryArchive(category, cursor, cursor ? { skipIds } : { skipIds, limit }),
    getMenuCategories(),
  ]);
  return { archive, menu };
}, ["public-category-inputs"], { revalidate: 60, tags: ["public-listings"] });
function revive(article: ArticleSummary): ArticleSummary {
  return article.publishedAt instanceof Date ? article : { ...article, publishedAt: new Date(article.publishedAt) };
}
export async function loadPublicCategory(category: CategoryRef, cursor: CategoryCursor | null) {
  const now = Date.now();
  const asOfMs = publicAsOfMs(now);
  const [front, latest24h] = await Promise.all([categoryFront(category.id, now), getLatest24Hours(asOfMs)]);
  const skipIds = cursor ? front.pinnedIds : [...front.pinnedIds, ...front.excludedIds];
  const view = await readCategoryView(category, cursor, skipIds, Math.max(1, CATEGORY_PAGE_SIZE - front.pins.length));
  const archive = { ...view.archive, articles: view.archive.articles.map(revive) };
  const pins = front.pins.map(revive);
  return { ...view, asOfMs, front: { ...front, pins }, archive, nextChangeAt: cursor ? null : front.nextChangeAt, latest24h: latest24h.map(revive),
    articles: cursor ? archive.articles : [...pins, ...archive.articles].slice(0, CATEGORY_PAGE_SIZE) };
}
