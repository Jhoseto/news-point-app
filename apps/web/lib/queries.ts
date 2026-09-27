import "server-only";
import { cache } from "react";
import { and, asc, desc, eq, gt, inArray, lte, ne, sql } from "drizzle-orm";
import { articleBody, resolveMediaUrl, type ArticleBody, type FocalPoint, type ImageVariant, focalPointSchema, responsiveImageVariants } from "@newspoint/content";
import { articleCategories, articles, categories, getDb, hasMediaPresentations, mediaAssets, mediaPresentations } from "@newspoint/db";
import { PUBLIC_MENU, menuName } from "./menu";
import { LATEST_WINDOW_MS } from "./latest-window";
import { searchTerms } from "./search";

export interface Media {
  url: string;
  width: number | null;
  height: number | null;
  alt: string;
  caption: string;
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
}

const baseSummaryColumns = {
  id: articles.id,
  path: articles.path,
  title: articles.title,
  excerpt: articles.excerpt,
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
  };
}

function toSummary(row: SummaryRow): ArticleSummary {
  return {
    id: row.id!,
    path: row.path!,
    title: row.title!,
    excerpt: row.excerpt ?? "",
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

async function summaryQuery() {
  const db = getDb();
  const ready = await hasMediaPresentations(db);
  const query = db
    .select(summaryColumns(ready))
    .from(articles)
    .leftJoin(categories, eq(categories.id, articles.primaryCategoryId))
    .leftJoin(mediaAssets, eq(mediaAssets.id, articles.heroMediaId));
  // Wrap the thenable builder so an async return does not execute it before
  // the caller adds the public-content filter and limit.
  return { query: ready ? query.leftJoin(mediaPresentations, eq(mediaPresentations.mediaAssetId, mediaAssets.id)) : query };
}

export const getMenuCategories = cache(async (): Promise<CategoryRef[]> => {
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
});

export const getLatest = cache(async (limit: number): Promise<ArticleSummary[]> => {
  const rows = await (await summaryQuery()).query.where(isPublished()).orderBy(desc(articles.publishedAt)).limit(limit);
  return rows.map(toSummary);
});

/** Complete rolling 24-hour feed; the public published-at index supports the range scan. */
export const getLatest24Hours = cache(async (asOfMs: number): Promise<ArticleSummary[]> => {
  const rows = await (await summaryQuery()).query
    .where(and(isPublished(), gt(articles.publishedAt, new Date(asOfMs - LATEST_WINDOW_MS))))
    .orderBy(desc(articles.publishedAt));
  return rows.map(toSummary);
});

export const getByCategory = cache(async (categoryId: string, limit: number): Promise<ArticleSummary[]> => {
  const rows = await (await summaryQuery()).query
    .innerJoin(articleCategories, eq(articleCategories.articleId, articles.id))
    .where(and(isPublished(), eq(articleCategories.categoryId, categoryId)))
    .orderBy(desc(articles.publishedAt))
    .limit(limit);
  return rows.map(toSummary);
});

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
  const ready = await hasMediaPresentations(db);
  const query = db
    .select({ ...summaryColumns(ready), authorName: articles.authorName, sourceUrl: articles.sourceUrl, body: articles.body })
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

  return {
    ...toSummary(row),
    authorName: row.authorName,
    sourceUrl: row.sourceUrl,
    body,
    media,
    categories: linked.map((category) => ({ ...category, name: menuName(category.slug, category.name) })),
  };
});

/** Case-insensitive search over published titles and excerpts, newest first. */
export async function searchArticles(query: string, limit: number): Promise<ArticleSummary[]> {
  const terms = searchTerms(query);
  if (!terms.length) return [];
  const matches = terms.map((term) => {
    const pattern = `%${term.replace(/[\\%_]/g, "\\$&")}%`;
    return sql`(${articles.title} ilike ${pattern} or ${articles.excerpt} ilike ${pattern})`;
  });
  const rows = await (await summaryQuery()).query
    .where(and(isPublished(), ...matches))
    .orderBy(desc(articles.publishedAt))
    .limit(limit);
  return rows.map(toSummary);
}

/** Summaries for live notifications, keyed by article id. Runs outside a request, so no cache(). */
export async function getSummariesByIds(ids: string[]): Promise<Map<string, ArticleSummary>> {
  if (!ids.length) return new Map();
  const rows = await (await summaryQuery()).query.where(and(isPublished(), inArray(articles.id, ids)));
  return new Map(rows.map((row) => [row.id!, toSummary(row)]));
}

export const getRelated = cache(async (article: ArticleSummary, limit: number): Promise<ArticleSummary[]> => {
  if (!article.category) return [];
  const rows = await (await summaryQuery()).query
    .innerJoin(articleCategories, eq(articleCategories.articleId, articles.id))
    .where(
      and(
        isPublished(),
        eq(articleCategories.categoryId, article.category.id),
        ne(articles.id, article.id),
      ),
    )
    .orderBy(desc(articles.publishedAt))
    .limit(limit);
  return rows.map(toSummary);
});
