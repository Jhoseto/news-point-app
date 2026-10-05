import "server-only";
import { unstable_cache } from "next/cache";
import { cache } from "react";
import { and, asc, desc, eq, gt, ilike, inArray, lte, ne, notInArray, or, sql } from "drizzle-orm";
import { articleBody, resolveMediaUrl, type ArticleBody, type FocalPoint, type ImageVariant, focalPointSchema, responsiveImageVariants } from "@newspoint/content";
import { recommendationTerms, rankArticleRecommendations } from "./article-recommendations";
import { articleCategories, articleReadCounts, articleViewBoosts, articles, authorProfiles, categories, getDb, hasArticleReadCounts, hasArticleViewBoosts, hasMediaPresentations, mediaAssets, mediaPresentations, staffUsers, storyThemeArticles, storyThemes } from "@newspoint/db";
import { PUBLIC_MENU, menuName } from "./menu";
import { LATEST_WINDOW_MS } from "./latest-window";
import { searchTerms } from "./search";
import { CATEGORY_PAGE_SIZE, categoryCursorUrl, type CategoryCursor } from "./category-pagination";
import { archiveBoundary, archiveFilter, archiveNow, archiveOrder, archiveTimestamp } from "./category-archive-query";
import { searchArchiveFilter, searchMatches } from "./search-query";
import { searchCursorUrl, type SearchCursor } from "./search-pagination";
import type { SearchFilters } from "./search";

export interface Media {
  url: string;
  width: number | null;
  height: number | null;
  alt: string;
  caption: string;
  credit: string;
  variants?: ImageVariant[];
  focalPoint?: FocalPoint | null;
}

export interface CategoryRef {
  id: string;
  slug: string;
  name: string;
  path: string;
}

export interface ArticleSummary {
  id: string;
  path: string;
  title: string;
  excerpt: string;
  heroEmbedUrl?: string | null;
  authorName: string;
  publishedAt: Date;
  category: CategoryRef | null;
  hero: Media | null;
}

export interface ArticleDetail extends ArticleSummary {
  authorName: string;
  sourceUrl: string | null;
  body: ArticleBody;
  media: Map<string, Media>;
  categories: CategoryRef[];
  readCount: number | null;
  listenEnabled: boolean;
}

export const getPublicTeam = cache(async (): Promise<{ id: string; name: string; bio: string }[]> => {
  return getDb().select({ id: staffUsers.id, name: staffUsers.name, bio: authorProfiles.bio })
    .from(authorProfiles)
    .innerJoin(staffUsers, eq(staffUsers.id, authorProfiles.staffUserId))
    .where(eq(authorProfiles.isPublic, true))
    .orderBy(asc(staffUsers.name));
});

const baseSummaryColumns = {
  id: articles.id,
  path: articles.path,
  title: articles.title,
  excerpt: articles.excerpt,
  heroEmbedUrl: articles.heroEmbedUrl,
  authorName: articles.authorName,
  publishedAt: articles.publishedAt,
  categoryId: categories.id,
  categorySlug: categories.slug,
  categoryName: categories.name,
  categoryPath: categories.path,
  mediaProvider: mediaAssets.provider,
  mediaSourceUrl: mediaAssets.sourceUrl,
  mediaStorageKey: mediaAssets.storageKey,
  mediaWidth: mediaAssets.width,
  mediaHeight: mediaAssets.height,
  mediaAlt: mediaAssets.alt,
  mediaCaption: mediaAssets.caption,
  mediaCredit: mediaAssets.credit,
};

type SummaryRow = {
  [K in keyof typeof baseSummaryColumns]: (typeof baseSummaryColumns)[K]["_"]["data"] | null;
} & { mediaVariants: unknown; mediaFocalX: number | null; mediaFocalY: number | null };

function summaryColumns(ready: boolean) {
  return { ...baseSummaryColumns,
    mediaVariants: ready ? mediaPresentations.variants : sql<unknown>`'[]'::jsonb`,
    mediaFocalX: ready ? mediaPresentations.focalX : sql<number | null>`null::real`,
    mediaFocalY: ready ? mediaPresentations.focalY : sql<number | null>`null::real`,
  };
}

function toMedia(row: {
  provider: "wordpress_origin" | "object_storage" | null;
  sourceUrl: string | null;
  storageKey: string | null;
  width: number | null;
  height: number | null;
  alt: string | null;
  caption: string | null;
  credit: string | null;
  variants?: unknown;
  focalX?: number | null;
  focalY?: number | null;
}): Media | null {
  if (!row.provider) return null;
  const url = resolveMediaUrl({ provider: row.provider, sourceUrl: row.sourceUrl, storageKey: row.storageKey });
  const focal = focalPointSchema.safeParse({ x: row.focalX, y: row.focalY });
  return {
    url,
    variants: responsiveImageVariants(row.variants, { url, width: row.width, height: row.height }),
    focalPoint: focal.success ? focal.data : null,
    width: row.width,
    height: row.height,
    alt: row.alt ?? "",
    caption: row.caption ?? "",
    credit: row.credit ?? "",
  };
}

function reviveSummary(article: ArticleSummary): ArticleSummary {
  return article.publishedAt instanceof Date ? article : { ...article, publishedAt: new Date(article.publishedAt) };
}

function toSummary(row: SummaryRow): ArticleSummary {
  return {
    id: row.id!,
    path: row.path!,
    title: row.title!,
    excerpt: row.excerpt ?? "",
    heroEmbedUrl: row.heroEmbedUrl ?? null,
    authorName: row.authorName ?? "NewsPoint.bg",
    publishedAt: row.publishedAt!,
    category: row.categoryId
      ? { id: row.categoryId, slug: row.categorySlug!, name: menuName(row.categorySlug!, row.categoryName!), path: row.categoryPath! }
      : null,
    hero: toMedia({
      provider: row.mediaProvider,
      sourceUrl: row.mediaSourceUrl,
      storageKey: row.mediaStorageKey,
      width: row.mediaWidth,
      height: row.mediaHeight,
      alt: row.mediaAlt,
      caption: row.mediaCaption,
      credit: row.mediaCredit,
      variants: row.mediaVariants,
      focalX: row.mediaFocalX,
      focalY: row.mediaFocalY,
    }),
  };
}

// Public means flagged public and already published (DEC-113).
function isPublished() {
  return and(eq(articles.isPublic, true), lte(articles.publishedAt, sql`now()`))!;
}

async function summaryQuery(archive = false) {
  const db = getDb();
  const ready = await hasMediaPresentations(db);
  const query = db
    .select({ ...summaryColumns(ready), archivePublishedAt: archive ? archiveTimestamp : sql<string | null>`null::text` })
    .from(articles)
    .leftJoin(categories, eq(categories.id, articles.primaryCategoryId))
    .leftJoin(mediaAssets, eq(mediaAssets.id, articles.heroMediaId));
  // Wrap the thenable builder so an async return does not execute it before
  // the caller adds the public-content filter and limit.
  return { query: ready ? query.leftJoin(mediaPresentations, eq(mediaPresentations.mediaAssetId, mediaAssets.id)) : query };
}

const readMenuCategories = unstable_cache(async (): Promise<CategoryRef[]> => {
  const slugs = PUBLIC_MENU.map((entry) => entry.slug);
  const rows = await getDb()
    .select({ id: categories.id, slug: categories.slug, name: categories.name, path: categories.path })
    .from(categories)
    .where(inArray(categories.slug, slugs));
  const bySlug = new Map(rows.map((row) => [row.slug, row]));
  return PUBLIC_MENU.flatMap((entry) => {
    const row = bySlug.get(entry.slug);
    return row ? [{ ...row, name: entry.name }] : [];
  });
}, ["public-menu"], { revalidate: 60 });

export const getMenuCategories = cache(async (): Promise<CategoryRef[]> => readMenuCategories());

export const getLatest = cache(async (limit: number): Promise<ArticleSummary[]> => {
  const rows = await (await summaryQuery()).query.where(isPublished()).orderBy(desc(articles.publishedAt)).limit(limit);
  return rows.map(toSummary);
});

const readLatest24Hours = unstable_cache(async (minute: number): Promise<ArticleSummary[]> => {
  const asOfMs = minute * 60_000;
  const rows = await (await summaryQuery()).query
    .where(and(isPublished(), gt(articles.publishedAt, new Date(asOfMs - LATEST_WINDOW_MS))))
    .orderBy(desc(articles.publishedAt));
  return rows.map(toSummary);
}, ["public-latest-24h"], { revalidate: 60 });

/** Minute bucket so a public page can stay on the ISR path. */
export function publicAsOfMs(now = Date.now()): number {
  return Math.floor(now / 60_000) * 60_000;
}

/** Complete rolling 24-hour feed; the public published-at index supports the range scan. */
export const getLatest24Hours = cache(async (asOfMs: number): Promise<ArticleSummary[]> => {
  const rows = await readLatest24Hours(Math.floor(asOfMs / 60_000));
  return rows.map(reviveSummary);
});

export const getByCategory = cache(async (categoryId: string, limit: number): Promise<ArticleSummary[]> => {
  const rows = await (await summaryQuery()).query
    .innerJoin(articleCategories, eq(articleCategories.articleId, articles.id))
    .where(and(isPublished(), eq(articleCategories.categoryId, categoryId)))
    .orderBy(desc(articles.publishedAt))
    .limit(limit);
  return rows.map(toSummary);
});

export interface CategoryArchive {
  articles: ArticleSummary[];
  previous: string | null;
  next: string | null;
  anchored: boolean;
}

/** Keyset navigation: one bounded page, one small opposite-direction probe. No COUNT/OFFSET. */
export async function getCategoryArchive(
  category: CategoryRef,
  cursor: CategoryCursor | null,
  options?: { skipIds?: string[]; limit?: number },
): Promise<CategoryArchive> {
  const limit = options?.limit ?? CATEGORY_PAGE_SIZE;
  const skipKey = (options?.skipIds ?? []).join(",");
  const archive = await readCategoryArchive(category, cursor, skipKey, limit);
  return { ...archive, articles: archive.articles.map(reviveSummary) };
}

const readCategoryArchive = unstable_cache(async (
  category: CategoryRef,
  cursor: CategoryCursor | null,
  skipKey: string,
  limit: number,
): Promise<CategoryArchive> => queryCategoryArchive(category, cursor, {
  skipIds: skipKey ? skipKey.split(",") : [],
  limit,
}), ["public-category-archive"], { revalidate: 60 });

async function queryCategoryArchive(
  category: CategoryRef,
  cursor: CategoryCursor | null,
  options?: { skipIds?: string[]; limit?: number },
): Promise<CategoryArchive> {
  const db = getDb();
  const pageSize = options?.limit ?? CATEGORY_PAGE_SIZE;
  const skip = options?.skipIds?.length ? notInArray(articles.id, options.skipIds) : undefined;
  const anchor = cursor?.anchor ?? (await db.select({ at: archiveNow }).from(articles).limit(1))[0]?.at;
  if (!anchor) return { articles: [], previous: null, next: null, anchored: !!cursor };
  const direction = cursor?.direction ?? "older";
  const filter = archiveFilter(category.id, anchor);
  const rows = await (await summaryQuery(true)).query
    .innerJoin(articleCategories, eq(articleCategories.articleId, articles.id))
    .where(and(filter, cursor ? archiveBoundary(cursor.boundary, direction) : undefined, skip))
    .orderBy(...archiveOrder(direction))
    .limit(pageSize + 1);
  // Preserve the exact DB timestamp separately from the display Date.
  const pageRows = rows.slice(0, pageSize);
  if (direction === "newer") pageRows.reverse();
  if (!pageRows.length) return { articles: [], previous: null, next: null, anchored: !!cursor };
  const first = { id: pageRows[0]!.id!, at: pageRows[0]!.archivePublishedAt! };
  const last = { id: pageRows.at(-1)!.id!, at: pageRows.at(-1)!.archivePublishedAt! };
  let previous = direction === "newer" && rows.length > pageSize;
  let next = direction === "older" && rows.length > pageSize;
  if (cursor) {
    const opposite = direction === "older" ? "newer" : "older";
    const probe = await db.select({ id: articles.id }).from(articles)
      .innerJoin(articleCategories, eq(articleCategories.articleId, articles.id))
      .where(and(filter, archiveBoundary(opposite === "newer" ? first : last, opposite), skip))
      .limit(1);
    if (opposite === "newer") previous = probe.length > 0;
    else next = probe.length > 0;
  }
  const link = (boundary: CategoryCursor["boundary"], dir: CategoryCursor["direction"]) =>
    categoryCursorUrl(category.path, { v: 1, category: category.id, anchor, boundary, direction: dir });
  return {
    articles: pageRows.map(toSummary), anchored: !!cursor,
    previous: previous ? link(first, "newer") : null,
    next: next ? link(last, "older") : null,
  };
}

export const getLabelled = cache(async (labelSlug: string, limit: number): Promise<ArticleSummary[]> => {
  const [label] = await getDb().select({ id: categories.id }).from(categories).where(eq(categories.slug, labelSlug)).limit(1);
  return label ? getByCategory(label.id, limit) : [];
});

export const getCategoryByPath = cache(async (path: string): Promise<CategoryRef | null> => {
  const [row] = await getDb()
    .select({ id: categories.id, slug: categories.slug, name: categories.name, path: categories.path })
    .from(categories)
    .where(eq(categories.path, path))
    .limit(1);
  return row ? { ...row, name: menuName(row.slug, row.name) } : null;
});

export const getArticleByPath = cache(async (path: string): Promise<ArticleDetail | null> => {
  const db = getDb();
  const [ready, readsReady] = await Promise.all([hasMediaPresentations(db), hasArticleReadCounts(db)]);
  const query = db
    .select({
      ...summaryColumns(ready),
      authorName: articles.authorName,
      sourceUrl: articles.sourceUrl,
      body: articles.body,
      listenEnabled: articles.listenEnabled,
    })
    .from(articles)
    .leftJoin(categories, eq(categories.id, articles.primaryCategoryId))
    .leftJoin(mediaAssets, eq(mediaAssets.id, articles.heroMediaId));
  const [row] = await (ready ? query.leftJoin(mediaPresentations, eq(mediaPresentations.mediaAssetId, mediaAssets.id)) : query)
    .where(and(eq(articles.path, path), isPublished()))
    .limit(1);
  if (!row) return null;

  const body = articleBody.parse(row.body);
  const imageIds = body.flatMap((block) => (block.type === "image" ? [block.mediaAssetId] : []));
  const mediaRows = imageIds.length
    ? await db.select().from(mediaAssets).where(inArray(mediaAssets.id, imageIds))
    : [];
  const presentations = ready && imageIds.length
    ? await db.select().from(mediaPresentations).where(inArray(mediaPresentations.mediaAssetId, imageIds)) : [];
  const presentationMap = new Map(presentations.map(item => [item.mediaAssetId, item]));
  const media = new Map<string, Media>();
  for (const asset of mediaRows) {
    const resolved = toMedia({ ...asset, ...presentationMap.get(asset.id) });
    if (resolved) media.set(asset.id, resolved);
  }

  const linked = await db
    .select({ id: categories.id, slug: categories.slug, name: categories.name, path: categories.path })
    .from(articleCategories)
    .innerJoin(categories, eq(categories.id, articleCategories.categoryId))
    .where(and(eq(articleCategories.articleId, row.id), eq(categories.kind, "section")))
    .orderBy(asc(categories.name));

  const boostsReady = await hasArticleViewBoosts(db);
  const realCount = readsReady
    ? (await db.select({ value: articleReadCounts.readCount }).from(articleReadCounts)
      .where(eq(articleReadCounts.articleId, row.id)).limit(1))[0]?.value ?? 0
    : null;
  const addedCount = readsReady && boostsReady
    ? (await db.select({ value: articleViewBoosts.artificialCount }).from(articleViewBoosts)
      .where(eq(articleViewBoosts.articleId, row.id)).limit(1))[0]?.value ?? 0
    : 0;

  return {
    ...toSummary(row),
    authorName: row.authorName,
    sourceUrl: row.sourceUrl,
    body,
    media,
    categories: linked.map((category) => ({ ...category, name: menuName(category.slug, category.name) })),
    readCount: realCount === null ? null : realCount + addedCount,
    listenEnabled: row.listenEnabled,
  };
});

/** Case-insensitive search over published titles and excerpts, newest first. */
export async function searchArticles(query: string, limit: number): Promise<ArticleSummary[]> {
  const terms = searchTerms(query);
  if (!terms.length) return [];
  const matches = searchMatches(query);
  const rows = await (await summaryQuery()).query
    .where(and(isPublished(), ...matches))
    .orderBy(desc(articles.publishedAt))
    .limit(limit);
  return rows.map(toSummary);
}

/** Search snapshots use the same ordering and public cutoffs as category archives. */
export async function getSearchArchive(filters: SearchFilters, categoryId: string | null, cursor: SearchCursor | null): Promise<CategoryArchive> {
  if (!searchTerms(filters.query).length) return { articles: [], previous: null, next: null, anchored: !!cursor };
  const db = getDb();
  const anchor = cursor?.anchor ?? (await db.select({ at: archiveNow }).from(articles).limit(1))[0]?.at;
  if (!anchor) return { articles: [], previous: null, next: null, anchored: !!cursor };
  const direction = cursor?.direction ?? "older";
  const filter = searchArchiveFilter(filters.query, anchor, categoryId, filters.period);
  const rows = await (await summaryQuery(true)).query
    .where(and(filter, cursor ? archiveBoundary(cursor.boundary, direction) : undefined))
    .orderBy(...archiveOrder(direction)).limit(CATEGORY_PAGE_SIZE + 1);
  const pageRows = rows.slice(0, CATEGORY_PAGE_SIZE);
  if (direction === "newer") pageRows.reverse();
  if (!pageRows.length) return { articles: [], previous: null, next: null, anchored: !!cursor };
  const first = { id: pageRows[0]!.id!, at: pageRows[0]!.archivePublishedAt! };
  const last = { id: pageRows.at(-1)!.id!, at: pageRows.at(-1)!.archivePublishedAt! };
  let previous = direction === "newer" && rows.length > CATEGORY_PAGE_SIZE;
  let next = direction === "older" && rows.length > CATEGORY_PAGE_SIZE;
  if (cursor) {
    const opposite = direction === "older" ? "newer" : "older";
    const probe = await db.select({ id: articles.id }).from(articles)
      .where(and(filter, archiveBoundary(opposite === "newer" ? first : last, opposite))).limit(1);
    if (opposite === "newer") previous = probe.length > 0;
    else next = probe.length > 0;
  }
  const link = (boundary: SearchCursor["boundary"], dir: SearchCursor["direction"]) =>
    searchCursorUrl({ v: 1, ...filters, anchor, boundary, direction: dir });
  return { articles: pageRows.map(toSummary), previous: previous ? link(first, "newer") : null, next: next ? link(last, "older") : null, anchored: !!cursor };
}

/** Summaries for live notifications, keyed by article id. Runs outside a request, so no cache(). */
export async function getSummariesByIds(ids: string[]): Promise<Map<string, ArticleSummary>> {
  if (!ids.length) return new Map();
  const rows = await (await summaryQuery()).query.where(and(isPublished(), inArray(articles.id, ids)));
  return new Map(rows.map((row) => [row.id!, toSummary(row)]));
}

export const getRecommendedArticles = cache(async (article: ArticleDetail, limit = 8, excludeIds: string[] = []): Promise<ArticleSummary[]> => {
  const categoryIds = [...new Set(article.categories.map(({ id }) => id))];
  const anchors = recommendationTerms(`${article.title} ${article.excerpt}`).slice(0, 6);
  const [rubricRows, archiveRows] = await Promise.all([
    categoryIds.length
      ? summaryQuery().then(({ query }) => query
        .innerJoin(articleCategories, eq(articleCategories.articleId, articles.id))
        .where(and(isPublished(), inArray(articleCategories.categoryId, categoryIds), ne(articles.id, article.id)))
        .orderBy(desc(articles.publishedAt), desc(articles.id))
        .limit(180))
      : Promise.resolve([]),
    anchors.length
      ? summaryQuery().then(({ query }) => query
        .where(and(
          isPublished(),
          ne(articles.id, article.id),
          or(...anchors.flatMap((term) => [ilike(articles.title, `%${term}%`), ilike(articles.excerpt, `%${term}%`)])),
        ))
        .orderBy(desc(articles.publishedAt), desc(articles.id))
        .limit(140))
      : Promise.resolve([]),
  ]);
  const candidates = [...new Map([...rubricRows, ...archiveRows].map((row) => [row.id, toSummary(row)])).values()];
  return rankArticleRecommendations(article, candidates, { limit, excludeIds });
});

/** Neighbouring public stories in the primary rubric, nearest first. */
export const getArticleNeighbours = cache(async (article: ArticleSummary): Promise<{ older: ArticleSummary[]; newer: ArticleSummary[] }> => {
  if (!article.category) return { older: [], newer: [] };
  const inRubric = eq(articleCategories.categoryId, article.category.id);
  const at = sql`(select published_at from articles where id = ${article.id})`;
  const [olderRows, newerRows] = await Promise.all([
    summaryQuery().then(({ query }) => query
      .innerJoin(articleCategories, eq(articleCategories.articleId, articles.id))
      .where(and(isPublished(), inRubric, sql`(${articles.publishedAt}, ${articles.id}) < (${at}, ${article.id})`))
      .orderBy(desc(articles.publishedAt), desc(articles.id)).limit(1)),
    summaryQuery().then(({ query }) => query
      .innerJoin(articleCategories, eq(articleCategories.articleId, articles.id))
      .where(and(isPublished(), inRubric, sql`(${articles.publishedAt}, ${articles.id}) > (${at}, ${article.id})`))
      .orderBy(asc(articles.publishedAt), asc(articles.id)).limit(1)),
  ]);
  return { older: olderRows.map(toSummary), newer: newerRows.map(toSummary) };
});

/* -------------------------------------------------------------------------- */
/* Story themes (Теми с продължение)                                        */
/* -------------------------------------------------------------------------- */

/**
 * Safe wrapper for resolveMediaUrl. Throws if the asset is missing both
 * storageKey and sourceUrl, which would otherwise 500 the public page.
 */
function safeResolveUrl(asset: { storageKey: string | null; sourceUrl: string | null; provider: "wordpress_origin" | "object_storage" }): string | null {
  try {
    return resolveMediaUrl(asset);
  } catch {
    return null;
  }
}

export interface StoryThemeSummary {
  id: string;
  slug: string;
  title: string;
  summary: string;
  coverUrl: string | null;
  coverCaption: string;
  publishedAt: Date;
  articleCount: number;
}

export interface StoryThemeArticle {
  articleId: string;
  title: string;
  path: string;
  category: CategoryRef | null;
  heroUrl: string | null;
  publishedAt: Date | null;
  position: number;
}

export interface StoryThemeDetailPublic {
  id: string;
  slug: string;
  title: string;
  summary: string;
  intro: string;
  coverUrl: string | null;
  coverCaption: string;
  publishedAt: Date;
  articles: StoryThemeArticle[];
}

export interface StoryThemeRefPublic {
  id: string;
  slug: string;
  title: string;
  position: number;
  totalArticles: number;
}

async function getPublishedStoryThemesInternal({ limit }: { limit: number }): Promise<StoryThemeSummary[]> {
  const db = getDb();
  if (!hasMediaPresentations(db)) {
    return getPublishedStoryThemesLegacy({ limit });
  }
  const rows = await db
    .select({
      id: storyThemes.id,
      slug: storyThemes.slug,
      title: storyThemes.title,
      summary: storyThemes.summary,
      coverMediaId: storyThemes.coverMediaId,
      coverCaption: storyThemes.coverCaption,
      publishedAt: storyThemes.publishedAt,
      coverKey: mediaAssets.storageKey,
      coverSource: mediaAssets.sourceUrl,
      coverProvider: mediaAssets.provider,
    })
    .from(storyThemes)
    .leftJoin(mediaAssets, eq(mediaAssets.id, storyThemes.coverMediaId))
    .where(eq(storyThemes.isPublished, true))
    .orderBy(desc(storyThemes.publishedAt))
    .limit(limit);
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const countRows = await db
    .select({ themeId: storyThemeArticles.themeId, value: sql<number>`count(*)::int` })
    .from(storyThemeArticles)
    .where(inArray(storyThemeArticles.themeId, ids))
    .groupBy(storyThemeArticles.themeId);
  const counts = new Map<string, number>();
  for (const row of countRows) counts.set(row.themeId, row.value);
  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    coverCaption: row.coverCaption,
    publishedAt: row.publishedAt ?? new Date(0),
    articleCount: counts.get(row.id) ?? 0,
    coverUrl: row.coverMediaId
      ? safeResolveUrl({ storageKey: row.coverKey, sourceUrl: row.coverSource, provider: row.coverProvider as "wordpress_origin" | "object_storage" })
      : null,
  }));
}

async function getPublishedStoryThemesLegacy({ limit }: { limit: number }): Promise<StoryThemeSummary[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: storyThemes.id,
      slug: storyThemes.slug,
      title: storyThemes.title,
      summary: storyThemes.summary,
      coverMediaId: storyThemes.coverMediaId,
      coverCaption: storyThemes.coverCaption,
      publishedAt: storyThemes.publishedAt,
    })
    .from(storyThemes)
    .where(eq(storyThemes.isPublished, true))
    .orderBy(desc(storyThemes.publishedAt))
    .limit(limit);
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const countRows = await db
    .select({ themeId: storyThemeArticles.themeId, value: sql<number>`count(*)::int` })
    .from(storyThemeArticles)
    .where(inArray(storyThemeArticles.themeId, ids))
    .groupBy(storyThemeArticles.themeId);
  const counts = new Map<string, number>();
  for (const row of countRows) counts.set(row.themeId, row.value);
  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    coverCaption: row.coverCaption,
    publishedAt: row.publishedAt ?? new Date(0),
    articleCount: counts.get(row.id) ?? 0,
    coverUrl: null,
  }));
}

export const getPublishedStoryThemes = cache(({ limit = 24 }: { limit?: number } = {}): Promise<StoryThemeSummary[]> => {
  return unstable_cache(
    async () => getPublishedStoryThemesInternal({ limit }),
    ["public-story-themes", String(limit)],
    { revalidate: 60, tags: ["public-story-themes"] },
  )();
});

async function getStoryThemeBySlugInternal(slug: string): Promise<StoryThemeDetailPublic | null> {
  const db = getDb();
  const [theme] = await db
    .select({
      id: storyThemes.id,
      slug: storyThemes.slug,
      title: storyThemes.title,
      summary: storyThemes.summary,
      intro: storyThemes.intro,
      coverMediaId: storyThemes.coverMediaId,
      coverCaption: storyThemes.coverCaption,
      coverKey: mediaAssets.storageKey,
      coverSource: mediaAssets.sourceUrl,
      coverProvider: mediaAssets.provider,
      publishedAt: storyThemes.publishedAt,
    })
    .from(storyThemes)
    .leftJoin(mediaAssets, eq(mediaAssets.id, storyThemes.coverMediaId))
    .where(and(eq(storyThemes.slug, slug), eq(storyThemes.isPublished, true)))
    .limit(1);
  if (!theme) return null;

  const memberRows = await db
    .select({
      articleId: articles.id,
      title: articles.title,
      path: articles.path,
      isPublic: articles.isPublic,
      publishedAt: articles.publishedAt,
      position: storyThemeArticles.position,
      categoryName: categories.name,
      categorySlug: categories.slug,
      categoryPath: categories.path,
      heroKey: mediaAssets.storageKey,
      heroSource: mediaAssets.sourceUrl,
      heroProvider: mediaAssets.provider,
    })
    .from(storyThemeArticles)
    .innerJoin(articles, eq(articles.id, storyThemeArticles.articleId))
    .leftJoin(categories, eq(categories.id, articles.primaryCategoryId))
    .leftJoin(mediaAssets, eq(mediaAssets.id, articles.heroMediaId))
    .where(and(eq(storyThemeArticles.themeId, theme.id), eq(articles.isPublic, true)))
    .orderBy(asc(storyThemeArticles.position));
  return {
    id: theme.id,
    slug: theme.slug,
    title: theme.title,
    summary: theme.summary,
    intro: theme.intro,
    coverCaption: theme.coverCaption,
    publishedAt: theme.publishedAt ?? new Date(0),
    coverUrl: theme.coverMediaId
      ? safeResolveUrl({ storageKey: theme.coverKey, sourceUrl: theme.coverSource, provider: theme.coverProvider as "wordpress_origin" | "object_storage" })
      : null,
    articles: memberRows.map((row) => ({
      articleId: row.articleId,
      title: row.title,
      path: row.path,
      publishedAt: row.publishedAt,
      position: row.position,
      category: row.categoryName
        ? { id: row.articleId, slug: row.categorySlug ?? "", name: row.categoryName, path: row.categoryPath ?? "" }
        : null,
      heroUrl: row.heroKey
        ? safeResolveUrl({ storageKey: row.heroKey, sourceUrl: row.heroSource, provider: row.heroProvider as "wordpress_origin" | "object_storage" })
        : null,
    })),
  };
}

export const getStoryThemeBySlug = cache((slug: string): Promise<StoryThemeDetailPublic | null> => {
  // Normalize the cache key — Next.js usually decodes params, but be defensive.
  const normalized = decodeURIComponent(slug);
  return unstable_cache(
    async () => getStoryThemeBySlugInternal(normalized),
    ["public-story-theme", normalized],
    { revalidate: 60, tags: ["public-story-themes"] },
  )();
});

export async function getStoryThemesForArticle(articleId: string): Promise<StoryThemeRefPublic[]> {
  const db = getDb();
  const memberRows = await db
    .select({
      themeId: storyThemes.id,
      slug: storyThemes.slug,
      title: storyThemes.title,
      position: storyThemeArticles.position,
    })
    .from(storyThemeArticles)
    .innerJoin(storyThemes, eq(storyThemes.id, storyThemeArticles.themeId))
    .where(and(eq(storyThemeArticles.articleId, articleId), eq(storyThemes.isPublished, true)))
    .orderBy(asc(storyThemeArticles.position));
  if (memberRows.length === 0) return [];
  const themeIds = memberRows.map((r) => r.themeId);
  const totals = await db
    .select({ themeId: storyThemeArticles.themeId, value: sql<number>`count(*)::int` })
    .from(storyThemeArticles)
    .where(inArray(storyThemeArticles.themeId, themeIds))
    .groupBy(storyThemeArticles.themeId);
  const totalByTheme = new Map<string, number>();
  for (const row of totals) totalByTheme.set(row.themeId, row.value);
  return memberRows.map((row) => ({
    id: row.themeId,
    slug: row.slug,
    title: row.title,
    position: row.position,
    totalArticles: totalByTheme.get(row.themeId) ?? 0,
  }));
}

export async function getStoryThemeCompact(articleId: string): Promise<{ theme: StoryThemeSummary; articles: StoryThemeArticle[]; currentPosition: number } | null> {
  const refs = await getStoryThemesForArticle(articleId);
  if (refs.length === 0) return null;
  // Use the first theme the article belongs to (it can belong to multiple,
  // but the reader only needs one roadmap).
  const ref = refs[0]!;
  const detail = await getStoryThemeBySlug(ref.slug);
  if (!detail) return null;
  const summary: StoryThemeSummary = {
    id: detail.id,
    slug: detail.slug,
    title: detail.title,
    summary: detail.summary,
    coverUrl: detail.coverUrl,
    coverCaption: detail.coverCaption,
    publishedAt: detail.publishedAt,
    articleCount: detail.articles.length,
  };
  return { theme: summary, articles: detail.articles, currentPosition: ref.position };
}
