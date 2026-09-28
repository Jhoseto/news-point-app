import "server-only";
import { and, eq, inArray, sql } from "@newspoint/db/orm";
import { articleRevisions, articles, categories, getDb } from "@newspoint/db";
import { likePattern, shiftIsoDate, sofiaDayStart, type ArticleListQuery, type ArticleStatus } from "./article-list-query";
import type { ArticleListItem } from "./articles";

export type ArticleDesk = {
  items: ArticleListItem[];
  total: number;
  matched: number;
  published: number;
  drafts: number;
  changed: number;
  shown: number;
  page: number;
  pageCount: number;
};

function number(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function baseFilters(query: ArticleListQuery) {
  const parts = [];
  const term = likePattern(query.q);
  if (term) {
    parts.push(sql`(
      ${articles.title} ilike ${term} escape '\\'
      or ${articles.excerpt} ilike ${term} escape '\\'
      or ${articles.path} ilike ${term} escape '\\'
      or ${articles.slug} ilike ${term} escape '\\'
      or ${articles.authorName} ilike ${term} escape '\\'
    )`);
  }
  const author = likePattern(query.author);
  if (author) parts.push(sql`${articles.authorName} ilike ${author} escape '\\'`);
  if (query.source !== "all") parts.push(eq(articles.sourceSystem, query.source));
  if (query.category) parts.push(eq(articles.primaryCategoryId, query.category));
  if (query.hero === "with") parts.push(sql`${articles.heroMediaId} is not null`);
  if (query.hero === "without") parts.push(sql`${articles.heroMediaId} is null`);
  const column = query.dateField === "published" ? articles.publishedAt : articles.updatedAt;
  const start = query.from ? sofiaDayStart(query.from) : null;
  const end = query.to ? sofiaDayStart(shiftIsoDate(query.to, 1)) : null;
  if (start) parts.push(sql`${column} >= ${start}`);
  if (end) parts.push(sql`${column} < ${end}`);
  return parts;
}

const unpublishedChange = sql`${articles.isPublic} and exists (
  select 1 from (
    select max(r.number) as latest from ${articleRevisions} r where r.article_id = ${articles.id}
  ) m
  where m.latest is not null and m.latest is distinct from ${articles.publishedRevision}
)`;

function statusFilter(status: ArticleStatus) {
  if (status === "published") return sql`${articles.isPublic}`;
  if (status === "draft") return sql`not ${articles.isPublic}`;
  if (status === "changed") return unpublishedChange;
  return undefined;
}

function orderBy(query: ArticleListQuery) {
  const column = query.sort === "published" ? articles.publishedAt : query.sort === "title" ? articles.title : query.sort === "author" ? articles.authorName : articles.updatedAt;
  if (query.sort === "published" && query.dir === "asc") return sql`${column} asc nulls last, ${articles.id} asc`;
  if (query.sort === "published") return sql`${column} desc nulls last, ${articles.id} desc`;
  return query.dir === "asc" ? sql`${column} asc, ${articles.id} asc` : sql`${column} desc, ${articles.id} desc`;
}

export async function queryArticleDesk(query: ArticleListQuery): Promise<ArticleDesk> {
  const db = getDb();
  const base = and(...baseFilters(query)) ?? sql`true`;
  const countRows = await db.execute<{ total: number; matched: number; published: number; drafts: number; changed: number }>(sql`
    with matched as materialized (
      select ${articles.id} as id, ${articles.isPublic} as is_public, ${articles.publishedRevision} as published_revision
      from ${articles}
      where ${base}
    )
    select
      (select count(*)::int from ${articles}) as total,
      count(*)::int as matched,
      count(*) filter (where matched.is_public)::int as published,
      count(*) filter (where not matched.is_public)::int as drafts,
      count(*) filter (where matched.is_public and m.latest is not null and m.latest is distinct from matched.published_revision)::int as changed
    from matched
    left join lateral (
      select max(r.number) as latest from ${articleRevisions} r where r.article_id = matched.id
    ) m on true
  `);
  const counts = countRows[0];
  const matched = number(counts?.matched);
  const published = number(counts?.published);
  const drafts = number(counts?.drafts);
  const changedCount = number(counts?.changed);
  const shown = query.status === "published" ? published : query.status === "draft" ? drafts : query.status === "changed" ? changedCount : matched;
  const pageCount = Math.max(1, Math.ceil(shown / query.pageSize));
  const page = Math.min(query.page, pageCount);
  const status = statusFilter(query.status);
  const where = status ? and(base, status) : base;
  const rows = await db
    .select({
      id: articles.id,
      title: articles.title,
      sourceSystem: articles.sourceSystem,
      isPublic: articles.isPublic,
      path: articles.path,
      publishedAt: articles.publishedAt,
      updatedAt: articles.updatedAt,
      categoryName: categories.name,
      authorName: articles.authorName,
      publishedRevision: articles.publishedRevision,
    })
    .from(articles)
    .leftJoin(categories, eq(categories.id, articles.primaryCategoryId))
    .where(where)
    .orderBy(orderBy(query))
    .limit(query.pageSize)
    .offset((page - 1) * query.pageSize);
  const ids = rows.map((row) => row.id);
  const latestRows = ids.length
    ? await db
        .select({ articleId: articleRevisions.articleId, latest: sql<number>`max(${articleRevisions.number})::int` })
        .from(articleRevisions)
        .where(inArray(articleRevisions.articleId, ids))
        .groupBy(articleRevisions.articleId)
    : [];
  const latestById = new Map(latestRows.map((row) => [row.articleId, number(row.latest)]));

  return {
    items: rows.map(({ publishedRevision, ...row }) => {
      const latest = latestById.get(row.id) ?? null;
      return { ...row, hasUnpublishedChanges: row.isPublic && latest !== null && latest !== publishedRevision };
    }),
    total: number(counts?.total),
    matched,
    published,
    drafts,
    changed: changedCount,
    shown,
    page,
    pageCount,
  };
}
