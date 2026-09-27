import { and, sql } from "drizzle-orm";
import { articles, articleCategories } from "@newspoint/db/schema";
import { SEARCH_PERIODS, searchTerms, type SearchPeriod } from "./search";

export function searchMatches(query: string) {
  return searchTerms(query).map(term => {
    const pattern = `%${term.replace(/[\\%_]/g, "\\$&")}%`;
    return sql`(${articles.title} ilike ${pattern} or ${articles.excerpt} ilike ${pattern})`;
  });
}

export function searchArchiveFilter(query: string, anchor: string, categoryId: string | null, period: SearchPeriod) {
  const duration = SEARCH_PERIODS.find(item => item.value === period)!.ms;
  return and(
    sql`${articles.isPublic} = true`,
    sql`${articles.publishedAt} <= least(${anchor}::timestamptz, now())`,
    sql`${articles.createdAt} <= ${anchor}::timestamptz`,
    ...searchMatches(query),
    categoryId ? sql`exists (select 1 from ${articleCategories} where ${articleCategories.articleId} = ${articles.id} and ${articleCategories.categoryId} = ${categoryId}::uuid)` : undefined,
    duration ? sql`${articles.publishedAt} > ${anchor}::timestamptz - (${duration} * interval '1 millisecond')` : undefined,
  )!;
}
