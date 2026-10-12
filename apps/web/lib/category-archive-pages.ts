import "server-only";
import { unstable_cache } from "next/cache";
import { desc, eq, sql } from "drizzle-orm";
import { articleCategories, articles, getDb } from "@newspoint/db";
import { archiveFilter, archiveTimestamp } from "./category-archive-query";
import {
  CATEGORY_PAGE_SIZE,
  categoryCursorUrl,
  listCategoryPageNumbers,
  type CategoryPageStripItem,
} from "./category-pagination";
import type { CategoryRef } from "./queries";

const readArchiveCount = unstable_cache(async (categoryId: string, anchor: string) => {
  const [row] = await getDb()
    .select({ count: sql<number>`count(*)::int` })
    .from(articles)
    .innerJoin(articleCategories, eq(articleCategories.articleId, articles.id))
    .where(archiveFilter(categoryId, anchor));
  return row?.count ?? 0;
}, ["public-category-archive-count"], { revalidate: 60, tags: ["public-listings"] });

const readArchivePageHref = unstable_cache(
  async (categoryId: string, categoryPath: string, anchor: string, page: number) => {
    if (page <= 1) return categoryPath;
    const offset = (page - 1) * CATEGORY_PAGE_SIZE - 1;
    const [row] = await getDb()
      .select({ id: articles.id, at: archiveTimestamp })
      .from(articles)
      .innerJoin(articleCategories, eq(articleCategories.articleId, articles.id))
      .where(archiveFilter(categoryId, anchor))
      .orderBy(desc(articles.publishedAt), desc(articles.id))
      .offset(offset)
      .limit(1);
    if (!row?.id || !row.at) return categoryPath;
    return categoryCursorUrl(categoryPath, {
      v: 1,
      category: categoryId,
      anchor,
      boundary: { id: row.id, at: row.at },
      direction: "older",
      page,
    });
  },
  ["public-category-archive-page-href"],
  { revalidate: 60, tags: ["public-listings"] },
);

export async function getCategoryArchiveTotalPages(category: CategoryRef, anchor: string): Promise<number> {
  if (!anchor) return 1;
  const count = await readArchiveCount(category.id, anchor);
  return Math.max(1, Math.ceil(count / CATEGORY_PAGE_SIZE));
}

export async function getCategoryArchivePageHref(category: CategoryRef, anchor: string, page: number): Promise<string> {
  if (!anchor || page <= 1) return category.path;
  return readArchivePageHref(category.id, category.path, anchor, page);
}

export async function buildCategoryArchivePageStrip(
  category: CategoryRef,
  anchor: string,
  currentPage: number,
  totalPages: number,
): Promise<CategoryPageStripItem[]> {
  const numbers = listCategoryPageNumbers(currentPage, totalPages);
  const hrefs = new Map(
    await Promise.all(
      numbers.map(async (page) => [page, await getCategoryArchivePageHref(category, anchor, page)] as const),
    ),
  );
  const items: CategoryPageStripItem[] = [];
  let last = 0;
  for (const page of numbers) {
    if (last && page - last > 1) items.push({ kind: "ellipsis" });
    last = page;
    if (page === currentPage) items.push({ kind: "current", page });
    else items.push({ kind: "page", page, href: hrefs.get(page)! });
  }
  return items;
}
