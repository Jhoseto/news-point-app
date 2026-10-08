import "server-only";
import { unstable_cache } from "next/cache";
import { categoryFront } from "./front-page";
import { CATEGORY_PAGE_SIZE, type CategoryCursor } from "./category-pagination";
import { getCategoryArchive, getMenuCategories, getLatest24Hours, publicAsOfMs, type ArticleSummary, type CategoryRef } from "./queries";

const readCategoryView = unstable_cache(async (category: CategoryRef, cursor: CategoryCursor | null) => {
  const asOfMs = publicAsOfMs();
  const front = await categoryFront(category.id, asOfMs);
  const skipIds = cursor ? front.pinnedIds : [...front.pinnedIds, ...front.excludedIds];
  const [archive, menu, latest24h] = await Promise.all([
    getCategoryArchive(category, cursor, cursor ? { skipIds } : { skipIds, limit: Math.max(1, CATEGORY_PAGE_SIZE - front.pins.length) }),
    getMenuCategories(), getLatest24Hours(asOfMs),
  ]);
  return { asOfMs, front, archive, menu, latest24h };
}, ["public-category-view"], { revalidate: 60, tags: ["public-listings"] });
function revive(article: ArticleSummary): ArticleSummary {
  return article.publishedAt instanceof Date ? article : { ...article, publishedAt: new Date(article.publishedAt) };
}
export async function loadPublicCategory(category: CategoryRef, cursor: CategoryCursor | null) {
  const view = await readCategoryView(category, cursor);
  const archive = { ...view.archive, articles: view.archive.articles.map(revive) };
  const pins = view.front.pins.map(revive);
  return { ...view, archive, latest24h: view.latest24h.map(revive),
    articles: cursor ? archive.articles : [...pins, ...archive.articles].slice(0, CATEGORY_PAGE_SIZE) };
}
