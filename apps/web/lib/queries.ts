import "server-only";
import { cache } from "react";
import { and, asc, desc, eq, inArray, lte, ne, sql } from "drizzle-orm";
import { articleBody, resolveMediaUrl, type ArticleBody } from "@newspoint/content";
import { articleCategories, articles, categories, getDb, mediaAssets } from "@newspoint/db";

export interface Media {
  url: string;
  width: number | null;
  height: number | null;
  alt: string;
  caption: string;
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

const summaryColumns = {
  id: articles.id,
  path: articles.path,
  title: articles.title,
  excerpt: articles.excerpt,
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
  [K in keyof typeof summaryColumns]: (typeof summaryColumns)[K]["_"]["data"] | null;
};

function toMedia(row: {
  provider: "wordpress_origin" | "object_storage" | null;
  sourceUrl: string | null;
  storageKey: string | null;
  width: number | null;
  height: number | null;
  alt: string | null;
  caption: string | null;
}): Media | null {
  if (!row.provider) return null;
  return {
    url: resolveMediaUrl({ provider: row.provider, sourceUrl: row.sourceUrl, storageKey: row.storageKey }),
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
    publishedAt: row.publishedAt!,
    category: row.categoryId
      ? { id: row.categoryId, slug: row.categorySlug!, name: row.categoryName!, path: row.categoryPath! }
      : null,
    hero: toMedia({
      provider: row.mediaProvider,
      sourceUrl: row.mediaSourceUrl,
      storageKey: row.mediaStorageKey,
      width: row.mediaWidth,
      height: row.mediaHeight,
      alt: row.mediaAlt,
      caption: row.mediaCaption,
    }),
  };
}

// Public means flagged public and already published (DEC-113).
function isPublished() {
  return and(eq(articles.isPublic, true), lte(articles.publishedAt, sql`now()`))!;
}

function summaryQuery() {
  return getDb()
    .select(summaryColumns)
    .from(articles)
    .leftJoin(categories, eq(categories.id, articles.primaryCategoryId))
    .leftJoin(mediaAssets, eq(mediaAssets.id, articles.heroMediaId));
}

export const getMenuCategories = cache(async (): Promise<CategoryRef[]> => {
  return getDb()
    .select({ id: categories.id, slug: categories.slug, name: categories.name, path: categories.path })
    .from(categories)
    .where(eq(categories.inMenu, true))
    .orderBy(asc(categories.menuOrder));
});

export const getLatest = cache(async (limit: number): Promise<ArticleSummary[]> => {
  const rows = await summaryQuery().where(isPublished()).orderBy(desc(articles.publishedAt)).limit(limit);
  return rows.map(toSummary);
});

export const getByCategory = cache(async (categoryId: string, limit: number): Promise<ArticleSummary[]> => {
  const rows = await summaryQuery()
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
  return row ?? null;
});

export const getArticleByPath = cache(async (path: string): Promise<ArticleDetail | null> => {
  const db = getDb();
  const [row] = await db
    .select({ ...summaryColumns, authorName: articles.authorName, sourceUrl: articles.sourceUrl, body: articles.body })
    .from(articles)
    .leftJoin(categories, eq(categories.id, articles.primaryCategoryId))
    .leftJoin(mediaAssets, eq(mediaAssets.id, articles.heroMediaId))
    .where(and(eq(articles.path, path), isPublished()))
    .limit(1);
  if (!row) return null;

  const body = articleBody.parse(row.body);
  const imageIds = body.flatMap((block) => (block.type === "image" ? [block.mediaAssetId] : []));
  const mediaRows = imageIds.length
    ? await db.select().from(mediaAssets).where(inArray(mediaAssets.id, imageIds))
    : [];
  const media = new Map<string, Media>();
  for (const asset of mediaRows) {
    const resolved = toMedia(asset);
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
    categories: linked,
  };
});

export const getRelated = cache(async (article: ArticleSummary, limit: number): Promise<ArticleSummary[]> => {
  if (!article.category) return [];
  const rows = await summaryQuery()
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
