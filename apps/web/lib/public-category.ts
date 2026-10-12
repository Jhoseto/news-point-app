import "server-only";
import { unstable_cache } from "next/cache";
import { categoryFront } from "./front-page";
import {
  CATEGORY_GRID_COLS,
  categoryArchiveNextUrl,
  trimCategoryGridOrphans,
} from "./category-grid-balance";
import { archiveBoundaryForArticle, countCategoryArticlesAfter } from "./category-grid-balance.server";
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

async function balancePublicCategoryArticles(
  category: CategoryRef,
  articles: ArticleSummary[],
  archive: { next: string | null; anchor: string },
  skipIds: string[],
) {
  if (!archive.anchor || !articles.length) return { articles, next: archive.next };
  const trimmed = await trimCategoryGridOrphans(articles, {
    hasNext: !!archive.next,
    boundaryFor: (item) => archiveBoundaryForArticle(item.id),
    countFollowing: (after) => countCategoryArticlesAfter(category.id, archive.anchor, after, skipIds, CATEGORY_GRID_COLS),
  });
  if (trimmed.length === articles.length) return { articles, next: archive.next };
  const last = await archiveBoundaryForArticle(trimmed.at(-1)!.id);
  const next = last && archive.next ? categoryArchiveNextUrl(category, archive.anchor, last) : archive.next;
  return { articles: trimmed, next };
}

export async function loadPublicCategory(category: CategoryRef, cursor: CategoryCursor | null) {
  const now = Date.now();
  const asOfMs = publicAsOfMs(now);
  const [front, latest24h] = await Promise.all([categoryFront(category.id, now), getLatest24Hours(asOfMs)]);
  const skipIds = cursor ? front.pinnedIds : [...front.pinnedIds, ...front.excludedIds];
  const view = await readCategoryView(category, cursor, skipIds, Math.max(1, CATEGORY_PAGE_SIZE - front.pins.length));
  const archive = { ...view.archive, articles: view.archive.articles.map(revive) };
  const pins = front.pins.map(revive);
  let articles = cursor ? archive.articles : [...pins, ...archive.articles].slice(0, CATEGORY_PAGE_SIZE);
  const balanced = await balancePublicCategoryArticles(category, articles, archive, skipIds);
  articles = balanced.articles;
  archive.next = balanced.next;
  return { ...view, asOfMs, front: { ...front, pins }, archive, nextChangeAt: cursor ? null : front.nextChangeAt, latest24h: latest24h.map(revive),
    articles };
}
