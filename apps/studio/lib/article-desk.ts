import "server-only";
import { and, eq, inArray, sql } from "@newspoint/db/orm";
import { articleReadCounts, articleRevisions, articleViewBoosts, articles, categories, getDb, hasArticleReadCounts, hasArticleViewBoosts, staffUsers } from "@newspoint/db";
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
  if (query.author === "newsroom") {
    parts.push(eq(articles.authorName, "NewsPoint.bg"));
  } else if (query.author === "anonymous") {
    parts.push(sql`(
      ${articles.authorName} is distinct from 'NewsPoint.bg'
      and (${articles.authorUserId} is null or not exists (select 1 from ${staffUsers} s where s.id = ${articles.authorUserId}))
      and not exists (select 1 from ${staffUsers} s where s.name <> '' and s.name = ${articles.authorName})
    )`);
  } else if (query.author) {
    parts.push(sql`(
      ${articles.authorUserId} = ${query.author}
      or ${articles.authorName} = (select ${staffUsers.name} from ${staffUsers} where ${staffUsers.id} = ${query.author})
    )`);
  }
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

function orderBy(query: ArticleListQuery, boostsReady: boolean) {
  if (query.sort === "views") {
    const views = boostsReady
      ? sql`(coalesce((select ${articleReadCounts.readCount} from ${articleReadCounts} where ${articleReadCounts.articleId} = ${articles.id}), 0) + coalesce((select ${articleViewBoosts.artificialCount} from ${articleViewBoosts} where ${articleViewBoosts.articleId} = ${articles.id}), 0))`
      : sql`(select ${articleReadCounts.readCount} from ${articleReadCounts} where ${articleReadCounts.articleId} = ${articles.id})`;
    return query.dir === "asc" ? sql`${views} asc nulls last, ${articles.id} asc` : sql`${views} desc nulls last, ${articles.id} desc`;
  }
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
  const readsReady = await hasArticleReadCounts(db);
  const boostsReady = await hasArticleViewBoosts(db);
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
    .orderBy(orderBy(query, boostsReady))
    .limit(query.pageSize)
    .offset((page - 1) * query.pageSize);
  const ids = rows.map((row) => row.id);
  const readRows = readsReady && ids.length
    ? await db.select({ articleId: articleReadCounts.articleId, readCount: articleReadCounts.readCount }).from(articleReadCounts).where(inArray(articleReadCounts.articleId, ids))
    : [];
  const readsById = new Map(readRows.map((row) => [row.articleId, number(row.readCount)]));
  const addedRows = boostsReady && ids.length
    ? await db.select({ articleId: articleViewBoosts.articleId, addedCount: articleViewBoosts.artificialCount }).from(articleViewBoosts).where(inArray(articleViewBoosts.articleId, ids))
    : [];
  const addedById = new Map(addedRows.map((row) => [row.articleId, number(row.addedCount)]));
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
      return { ...row, hasUnpublishedChanges: row.isPublic && latest !== null && latest !== publishedRevision, readCount: readsById.get(row.id) ?? null, addedCount: boostsReady ? addedById.get(row.id) ?? 0 : null };
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
