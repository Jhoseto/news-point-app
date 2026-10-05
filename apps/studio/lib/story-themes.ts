import "server-only";
import { and, asc, desc, eq, gte, ilike, inArray, ne, or, sql } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { cache } from "react";
import { randomUUID } from "node:crypto";
import {
  articles,
  categories,
  getDb,
  mediaAssets,
  outboxEvents,
  staffUsers,
  storyThemeArticles,
  storyThemes,
} from "@newspoint/db";
import { resolveMediaUrl, triggerRevalidate } from "@newspoint/content";
import { EditorError } from "./articles";
import { requireStaff, type Staff } from "./session";
import type {
  StoryThemeArticleEntry,
  StoryThemeArticleSearchResult,
  StoryThemeDetail,
  StoryThemeInput,
  StoryThemeListItem,
} from "./story-theme-types";

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SLUG_MIN = 3;
const SLUG_MAX = 80;
const SLUG_RESERVED = new Set([
  "api",
  "_next",
  "brand",
  "draft",
  "login",
  "search",
  "tag",
  "author",
  "page",
  "feed",
  "wp-admin",
  "wp-content",
  "wp-json",
  "temi",
]);

function assertSlug(slug: string) {
  if (slug.length < SLUG_MIN || slug.length > SLUG_MAX) {
    throw new EditorError(400, "invalid_slug", `URL адресът трябва да е между ${SLUG_MIN} и ${SLUG_MAX} символа.`);
  }
  if (!SLUG_PATTERN.test(slug)) {
    throw new EditorError(400, "invalid_slug", "URL адресът може да съдържа само малки латински букви, цифри и тирета.");
  }
  if (SLUG_RESERVED.has(slug)) {
    throw new EditorError(409, "slug_taken", "Този URL адрес е запазен. Изберете друг.");
  }
}

function assertInput(input: StoryThemeInput) {
  assertSlug(input.slug);
  if (input.title.trim().length < 5 || input.title.length > 160) {
    throw new EditorError(400, "invalid_title", "Заглавието трябва да е между 5 и 160 символа.");
  }
  if (input.summary.length > 280) {
    throw new EditorError(400, "invalid_summary", "Краткото описание е твърде дълго (макс. 280 символа).");
  }
  if (input.intro.length > 4000) {
    throw new EditorError(400, "invalid_intro", "Въведението е твърде дълго (макс. 4000 символа).");
  }
  if (input.coverCaption.length > 280) {
    throw new EditorError(400, "invalid_cover_caption", "Надписът на корицата е твърде дълъг (макс. 280 символа).");
  }
}

/**
 * Slug collision check: themes share the public URL space (`/temi/[slug]/`)
 * with articles (`/[slug]/`) and categories (`/[slug]/`). Reject any value that
 * would clash with an existing article or category path, or with the
 * reserved slug set.
 */
async function assertNoPathCollision(slug: string): Promise<void> {
  const db = getDb();
  const path = `/${slug}/`;
  const [article] = await db
    .select({ id: articles.id })
    .from(articles)
    .where(and(eq(articles.path, path), eq(articles.isPublic, true)))
    .limit(1);
  if (article) {
    throw new EditorError(409, "slug_taken", "Този URL адрес вече се използва от статия.");
  }
  const [category] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(eq(categories.path, path))
    .limit(1);
  if (category) {
    throw new EditorError(409, "slug_taken", "Този URL адрес вече се използва от рубрика.");
  }
}

function reviveTheme(row: { id: string; slug: string; title: string; summary: string; isPublished: boolean; publishedAt: Date | null; updatedAt: Date; coverUrl: string | null }, articleCount: number): StoryThemeListItem {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    isPublished: row.isPublished,
    publishedAt: row.publishedAt,
    updatedAt: row.updatedAt,
    articleCount,
    coverUrl: row.coverUrl,
  };
}

type StoryThemeRow = typeof storyThemes.$inferSelect;

async function listThemesInternal(status: "draft" | "published" | "all" = "all"): Promise<StoryThemeListItem[]> {
  const db = getDb();
  const where = status === "all" ? undefined : eq(storyThemes.isPublished, status === "published");
  const rows = await db
    .select({
      id: storyThemes.id,
      slug: storyThemes.slug,
      title: storyThemes.title,
      summary: storyThemes.summary,
      isPublished: storyThemes.isPublished,
      publishedAt: storyThemes.publishedAt,
      updatedAt: storyThemes.updatedAt,
      coverMediaId: storyThemes.coverMediaId,
    })
    .from(storyThemes)
    .where(where)
    .orderBy(desc(storyThemes.updatedAt));
  const ids = rows.map((row) => row.id);
  const counts = new Map<string, number>();
  if (ids.length) {
    const memberRows = await db
      .select({ themeId: storyThemeArticles.themeId })
      .from(storyThemeArticles)
      .where(inArray(storyThemeArticles.themeId, ids));
    for (const m of memberRows) counts.set(m.themeId, (counts.get(m.themeId) ?? 0) + 1);
  }
  const coverIds = rows.map((row) => row.coverMediaId).filter((id): id is string => Boolean(id));
  const coverMap = new Map<string, { url: string }>();
  if (coverIds.length) {
    const assets = await db
      .select({ id: mediaAssets.id, storageKey: mediaAssets.storageKey, sourceUrl: mediaAssets.sourceUrl, provider: mediaAssets.provider })
      .from(mediaAssets)
      .where(inArray(mediaAssets.id, coverIds));
    for (const asset of assets) {
      coverMap.set(asset.id, { url: resolveMediaUrl(asset) });
    }
  }
  return rows.map((row) => reviveTheme(
    {
      id: row.id,
      slug: row.slug,
      title: row.title,
      summary: row.summary,
      isPublished: row.isPublished,
      publishedAt: row.publishedAt,
      updatedAt: row.updatedAt,
      coverUrl: row.coverMediaId ? coverMap.get(row.coverMediaId)?.url ?? null : null,
    },
    counts.get(row.id) ?? 0,
  ));
}

export const listStoryThemes = cache(async (status: "draft" | "published" | "all" = "all"): Promise<StoryThemeListItem[]> => {
  return unstable_cache(
    async () => listThemesInternal(status),
    ["studio-story-themes", status],
    { revalidate: 60, tags: ["studio-story-themes"] },
  )();
});

type MemberRow = {
  position: number;
  addedAt: Date;
  addedBy: string | null;
  articleId: string;
  title: string;
  path: string;
  isPublic: boolean;
  publishedAt: Date;
  categoryName: string | null;
  heroStorageKey: string | null;
  heroSourceUrl: string | null;
  heroProvider: string | null;
  heroStorageId: string | null;
};

async function loadThemeInternal(id: string): Promise<StoryThemeDetail | null> {
  const db = getDb();
  const [theme] = await db.select().from(storyThemes).where(eq(storyThemes.id, id)).limit(1);
  if (!theme) return null;

  const authorName = theme.createdBy
    ? await db
        .select({ name: staffUsers.name, email: staffUsers.email })
        .from(staffUsers)
        .where(eq(staffUsers.id, theme.createdBy))
        .limit(1)
        .then((rows) => rows[0]?.name ?? rows[0]?.email ?? null)
    : null;

  const coverUrl = theme.coverMediaId
    ? await db
        .select({ id: mediaAssets.id, storageKey: mediaAssets.storageKey, sourceUrl: mediaAssets.sourceUrl, provider: mediaAssets.provider })
        .from(mediaAssets)
        .where(eq(mediaAssets.id, theme.coverMediaId))
        .limit(1)
        .then((rows) => (rows[0] ? resolveMediaUrl(rows[0]) : null))
    : null;

  const memberRows = await db
    .select({
      position: storyThemeArticles.position,
      addedAt: storyThemeArticles.addedAt,
      addedBy: storyThemeArticles.addedBy,
      articleId: articles.id,
      title: articles.title,
      path: articles.path,
      isPublic: articles.isPublic,
      publishedAt: articles.publishedAt,
      categoryName: categories.name,
      heroStorageKey: mediaAssets.storageKey,
      heroSourceUrl: mediaAssets.sourceUrl,
      heroProvider: mediaAssets.provider,
      heroStorageId: mediaAssets.id,
    })
    .from(storyThemeArticles)
    .innerJoin(articles, eq(articles.id, storyThemeArticles.articleId))
    .leftJoin(categories, eq(categories.id, articles.primaryCategoryId))
    .leftJoin(mediaAssets, eq(mediaAssets.id, articles.heroMediaId))
    .where(eq(storyThemeArticles.themeId, id))
    .orderBy(asc(storyThemeArticles.position));

  const heroMap = new Map<string, { storageKey: string | null; sourceUrl: string | null; provider: string | null }>();
  for (const row of memberRows) {
    if (row.heroStorageId && !heroMap.has(row.heroStorageId)) {
      heroMap.set(row.heroStorageId, { storageKey: row.heroStorageKey, sourceUrl: row.heroSourceUrl, provider: row.heroProvider });
    }
  }

  const authorById = new Map<string, string | null>();
  const memberAddedByIds = memberRows.map((m) => m.addedBy).filter((id): id is string => Boolean(id));
  for (const id of new Set(memberAddedByIds)) {
    if (!authorById.has(id)) {
      const [author] = await db
        .select({ name: staffUsers.name, email: staffUsers.email })
        .from(staffUsers)
        .where(eq(staffUsers.id, id))
        .limit(1);
      authorById.set(id, author?.name ?? author?.email ?? null);
    }
  }

  const entries: StoryThemeArticleEntry[] = memberRows.map((row) => {
    const heroUrl = row.heroStorageId && row.heroProvider
      ? (() => {
          const a = heroMap.get(row.heroStorageId);
          if (!a) return null;
          return resolveMediaUrl({ storageKey: a.storageKey, sourceUrl: a.sourceUrl, provider: a.provider as "wordpress_origin" | "object_storage" });
        })()
      : null;
    return {
      articleId: row.articleId,
      position: row.position,
      title: row.title,
      path: row.path,
      categoryName: row.categoryName,
      heroUrl,
      isPublic: row.isPublic,
      publishedAt: row.publishedAt,
      addedAt: row.addedAt,
      addedByName: row.addedBy ? authorById.get(row.addedBy) ?? null : null,
    };
  });

  return {
    id: theme.id,
    slug: theme.slug,
    title: theme.title,
    summary: theme.summary,
    intro: theme.intro,
    coverMediaId: theme.coverMediaId,
    coverCaption: theme.coverCaption,
    coverUrl,
    isPublished: theme.isPublished,
    publishedAt: theme.publishedAt,
    createdAt: theme.createdAt,
    updatedAt: theme.updatedAt,
    createdByName: authorName,
    articles: entries,
  };
}

export const loadStoryTheme = cache(async (id: string): Promise<StoryThemeDetail | null> => {
  return loadThemeInternal(id);
});

export async function createStoryTheme(
  staff: Staff,
  input: StoryThemeInput,
  articleIds: string[] = [],
): Promise<{ id: string; slug: string }> {
  assertInput(input);
  const db = getDb();
  const [existing] = await db
    .select({ id: storyThemes.id })
    .from(storyThemes)
    .where(eq(storyThemes.slug, input.slug))
    .limit(1);
  if (existing) {
    throw new EditorError(409, "slug_taken", "Този URL адрес вече се използва от друга тема.");
  }
  await assertNoPathCollision(input.slug);
  const id = randomUUID();
  await db.transaction(async (tx) => {
    await tx.insert(storyThemes).values({
      id,
      slug: input.slug,
      title: input.title.trim(),
      summary: input.summary,
      intro: input.intro,
      coverMediaId: input.coverMediaId,
      coverCaption: input.coverCaption,
      isPublished: false,
      createdBy: staff.id,
    });
    if (articleIds.length) {
      const deduped = Array.from(new Set(articleIds));
      await tx.insert(storyThemeArticles).values(
        deduped.map((articleId, i) => ({
          themeId: id,
          articleId,
          position: i + 1,
          addedBy: staff.id,
        })),
      );
    }
  });
  return { id, slug: input.slug };
}

export async function saveStoryTheme(
  staff: Staff,
  id: string,
  input: StoryThemeInput,
): Promise<void> {
  assertInput(input);
  const db = getDb();
  const [theme] = await db.select().from(storyThemes).where(eq(storyThemes.id, id)).limit(1);
  if (!theme) throw new EditorError(404, "not_found", "Темата не съществува.");
  const [slugConflict] = await db
    .select({ id: storyThemes.id })
    .from(storyThemes)
    .where(and(eq(storyThemes.slug, input.slug), ne(storyThemes.id, id)))
    .limit(1);
  if (slugConflict) {
    throw new EditorError(409, "slug_taken", "Този URL адрес вече се използва от друга тема.");
  }
  // Only check path collision if the slug actually changed — saves a query
  // on every regular save.
  if (input.slug !== theme.slug) {
    await assertNoPathCollision(input.slug);
  }
  // Save only updates metadata. Articles are managed through the dedicated
  // addArticle / removeArticle / reorder actions which write through the
  // canonical set immediately. Accepting them again here would clobber that.
  await db
    .update(storyThemes)
    .set({
      slug: input.slug,
      title: input.title.trim(),
      summary: input.summary,
      intro: input.intro,
      coverMediaId: input.coverMediaId,
      coverCaption: input.coverCaption,
      updatedAt: new Date(),
    })
    .where(eq(storyThemes.id, id));

  await emitOutbox(id, theme.slug, "story.updated");
  await revalidateThemePaths(theme.slug);
}

export async function publishStoryTheme(staff: Staff, id: string): Promise<void> {
  const db = getDb();
  const [theme] = await db.select().from(storyThemes).where(eq(storyThemes.id, id)).limit(1);
  if (!theme) throw new EditorError(404, "not_found", "Темата не съществува.");
  if (theme.isPublished) {
    throw new EditorError(422, "already_published", "Темата вече е публикувана.");
  }
  const [count] = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(storyThemeArticles)
    .where(eq(storyThemeArticles.themeId, id));
  if (!count || count.value < 1) {
    throw new EditorError(422, "not_ready", "Добавете поне една публикувана статия, за да публикувате темата.");
  }
  const [draftArticle] = await db
    .select({ id: articles.id })
    .from(storyThemeArticles)
    .innerJoin(articles, eq(articles.id, storyThemeArticles.articleId))
    .where(and(eq(storyThemeArticles.themeId, id), eq(articles.isPublic, false)))
    .limit(1);
  if (draftArticle) {
    throw new EditorError(422, "not_ready", "Всички статии в темата трябва да са публикувани.");
  }
  await db.update(storyThemes).set({ isPublished: true, publishedAt: new Date(), updatedAt: new Date() }).where(eq(storyThemes.id, id));
  await emitOutbox(id, theme.slug, "story.published");
  await revalidateThemePaths(theme.slug);
}

export async function unpublishStoryTheme(staff: Staff, id: string): Promise<void> {
  const db = getDb();
  const [theme] = await db.select().from(storyThemes).where(eq(storyThemes.id, id)).limit(1);
  if (!theme) throw new EditorError(404, "not_found", "Темата не съществува.");
  if (!theme.isPublished) {
    throw new EditorError(422, "not_published", "Темата вече е свалена от публикация.");
  }
  await db.update(storyThemes).set({ isPublished: false, publishedAt: null, updatedAt: new Date() }).where(eq(storyThemes.id, id));
  await emitOutbox(id, theme.slug, "story.updated");
  await revalidateThemePaths(theme.slug);
}

export async function deleteStoryTheme(staff: Staff, id: string): Promise<void> {
  const db = getDb();
  const [theme] = await db.select().from(storyThemes).where(eq(storyThemes.id, id)).limit(1);
  if (!theme) throw new EditorError(404, "not_found", "Темата не съществува.");
  await db.delete(storyThemes).where(eq(storyThemes.id, id));
  await emitOutbox(id, theme.slug, "story.updated");
  await revalidateThemePaths(theme.slug);
}

export async function addArticleToTheme(
  staff: Staff,
  themeId: string,
  articleId: string,
  position: number,
): Promise<void> {
  if (!Number.isInteger(position) || position < 1) {
    throw new EditorError(400, "invalid_position", "Позицията трябва да е цяло положително число.");
  }
  const db = getDb();
  const [theme] = await db.select().from(storyThemes).where(eq(storyThemes.id, themeId)).limit(1);
  if (!theme) throw new EditorError(404, "not_found", "Темата не съществува.");
  const [article] = await db
    .select({ id: articles.id, isPublic: articles.isPublic, path: articles.path })
    .from(articles)
    .where(eq(articles.id, articleId))
    .limit(1);
  if (!article) throw new EditorError(404, "article_not_found", "Статията не съществува.");
  if (!article.isPublic) {
    throw new EditorError(422, "article_not_published", "Само публикувани статии могат да се добавят в тема.");
  }
  const [existing] = await db
    .select({ themeId: storyThemeArticles.themeId })
    .from(storyThemeArticles)
    .where(and(eq(storyThemeArticles.themeId, themeId), eq(storyThemeArticles.articleId, articleId)))
    .limit(1);
  if (existing) {
    throw new EditorError(409, "already_in_theme", "Тази статия вече е в темата.");
  }
  await db.transaction(async (tx) => {
    // Shift existing positions >= the requested slot to make room, then
    // insert at the requested position. Keeps positions dense and unique.
    await tx
      .update(storyThemeArticles)
      .set({ position: sql`${storyThemeArticles.position} + 1` })
      .where(and(eq(storyThemeArticles.themeId, themeId), gte(storyThemeArticles.position, position)));
    await tx.insert(storyThemeArticles).values({
      themeId,
      articleId,
      position,
      addedBy: staff.id,
    });
  });
  await emitOutbox(themeId, theme.slug, "story.updated");
  await revalidateThemePaths(theme.slug);
}

export async function removeArticleFromTheme(staff: Staff, themeId: string, articleId: string): Promise<void> {
  const db = getDb();
  const [theme] = await db.select().from(storyThemes).where(eq(storyThemes.id, themeId)).limit(1);
  if (!theme) throw new EditorError(404, "not_found", "Темата не съществува.");
  await db
    .delete(storyThemeArticles)
    .where(and(eq(storyThemeArticles.themeId, themeId), eq(storyThemeArticles.articleId, articleId)));
  await emitOutbox(themeId, theme.slug, "story.updated");
  await revalidateThemePaths(theme.slug);
}

export async function reorderThemeArticles(
  staff: Staff,
  themeId: string,
  articleIds: string[],
): Promise<void> {
  if (articleIds.length < 1) {
    throw new EditorError(400, "empty_order", "Трябва да има поне една статия.");
  }
  const db = getDb();
  const [theme] = await db.select().from(storyThemes).where(eq(storyThemes.id, themeId)).limit(1);
  if (!theme) throw new EditorError(404, "not_found", "Темата не съществува.");
  const existing = await db
    .select({ articleId: storyThemeArticles.articleId })
    .from(storyThemeArticles)
    .where(eq(storyThemeArticles.themeId, themeId));
  const existingIds = new Set(existing.map((row) => row.articleId));
  const incomingIds = new Set(articleIds);
  if (existing.length !== articleIds.length || ![...existingIds].every((id) => incomingIds.has(id))) {
    throw new EditorError(400, "order_mismatch", "Списъкът със статии не съвпада с темата.");
  }
  await db.transaction(async (tx) => {
    for (let i = 0; i < articleIds.length; i += 1) {
      await tx
        .update(storyThemeArticles)
        .set({ position: i + 1 })
        .where(and(eq(storyThemeArticles.themeId, themeId), eq(storyThemeArticles.articleId, articleIds[i]!)));
    }
  });
  await emitOutbox(themeId, theme.slug, "story.updated");
  await revalidateThemePaths(theme.slug);
}

export async function searchPublicArticlesForTheme(
  staff: Staff,
  query: string,
  limit = 20,
): Promise<StoryThemeArticleSearchResult[]> {
  const q = query.trim();
  const db = getDb();
  const pattern = `%${q.replace(/[%_]/g, (ch) => `\\${ch}`)}%`;
  const rows = await db
    .select({
      id: articles.id,
      title: articles.title,
      path: articles.path,
      isPublic: articles.isPublic,
      publishedAt: articles.publishedAt,
      categoryName: categories.name,
      heroStorageKey: mediaAssets.storageKey,
      heroSourceUrl: mediaAssets.sourceUrl,
      heroProvider: mediaAssets.provider,
      heroStorageId: mediaAssets.id,
    })
    .from(articles)
    .leftJoin(categories, eq(categories.id, articles.primaryCategoryId))
    .leftJoin(mediaAssets, eq(mediaAssets.id, articles.heroMediaId))
    .where(
      and(
        eq(articles.isPublic, true),
        q.length > 0
          ? or(ilike(articles.title, pattern), ilike(articles.excerpt, pattern))
          : sql`true`,
      ),
    )
    .orderBy(desc(articles.publishedAt))
    .limit(limit);
  return rows.map((row) => {
    const heroUrl = row.heroStorageId && row.heroProvider
      ? resolveMediaUrl({
          storageKey: row.heroStorageKey,
          sourceUrl: row.heroSourceUrl,
          provider: row.heroProvider as "wordpress_origin" | "object_storage",
        })
      : null;
    return {
      id: row.id,
      title: row.title,
      path: row.path,
      categoryName: row.categoryName,
      heroUrl,
      publishedAt: row.publishedAt,
      isPublic: row.isPublic,
    };
  });
}

async function emitOutbox(themeId: string, slug: string, type: "story.published" | "story.updated"): Promise<void> {
  const db = getDb();
  await db.insert(outboxEvents).values({
    type,
    entityId: null,
    version: 1,
    payload: { path: `/temi/${slug}/`, title: "", topics: [] },
  });
}

async function revalidateThemePaths(slug: string): Promise<void> {
  await triggerRevalidate(["/temi", `/temi/${slug}/`]);
}
