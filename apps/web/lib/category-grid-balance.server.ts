import "server-only";
import { and, eq, notInArray } from "drizzle-orm";
import { articleCategories, articles, getDb } from "@newspoint/db";
import { archiveBoundary, archiveFilter, archiveTimestamp } from "./category-archive-query";
import type { CategoryCursor } from "./category-pagination";

export async function archiveBoundaryForArticle(articleId: string): Promise<CategoryCursor["boundary"] | null> {
  const [row] = await getDb()
    .select({ id: articles.id, at: archiveTimestamp })
    .from(articles)
    .where(eq(articles.id, articleId))
    .limit(1);
  if (!row?.id || !row.at) return null;
  return { id: row.id, at: row.at };
}

export async function countCategoryArticlesAfter(
  categoryId: string,
  anchor: string,
  after: CategoryCursor["boundary"],
  skipIds: string[],
  limit: number,
): Promise<number> {
  const db = getDb();
  const skip = skipIds.length ? notInArray(articles.id, skipIds) : undefined;
  const rows = await db
    .select({ id: articles.id })
    .from(articles)
    .innerJoin(articleCategories, eq(articleCategories.articleId, articles.id))
    .where(and(archiveFilter(categoryId, anchor), archiveBoundary(after, "older"), skip))
    .limit(limit);
  return rows.length;
}
