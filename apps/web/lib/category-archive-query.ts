import { and, asc, desc, eq, sql } from "drizzle-orm";
import { articles, articleCategories } from "@newspoint/db/schema";
import type { CategoryCursor } from "./category-pagination";

export const archiveTimestamp = sql<string>`to_char(${articles.publishedAt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;
export const archiveNow = sql<string>`to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;

export function archiveBoundary(boundary: CategoryCursor["boundary"], direction: CategoryCursor["direction"]) {
  const pair = sql`(${articles.publishedAt}, ${articles.id})`;
  const value = sql`(${boundary.at}::timestamptz, ${boundary.id}::uuid)`;
  return direction === "older" ? sql`${pair} < ${value}` : sql`${pair} > ${value}`;
}

export function archiveFilter(category: string, anchor: string) {
  return and(eq(articleCategories.categoryId, category), eq(articles.isPublic, true),
    sql`${articles.publishedAt} <= least(${anchor}::timestamptz, now())`,
    // Exclude newly imported backdated stories as well as new publications.
    sql`${articles.createdAt} <= ${anchor}::timestamptz`)!;
}

export function archiveOrder(direction: CategoryCursor["direction"]) {
  return direction === "newer" ? [asc(articles.publishedAt), asc(articles.id)] : [desc(articles.publishedAt), desc(articles.id)];
}
