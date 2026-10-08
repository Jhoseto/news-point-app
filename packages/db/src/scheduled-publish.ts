import { and, desc, eq, sql } from "drizzle-orm";
import type { ScriptDb } from "./node";
import { articleCategories, articleRevisions, articles, categories, mediaAssets, outboxEvents } from "./schema";
import { articleBody, publicationProblems } from "@newspoint/content";
import { revisionListen, qaPublicationAllowed } from "./editor-revisions";
import { applyArticlePublishViews } from "./view-boosts";

const readiness = new WeakMap<object, { until: number; pending: Promise<boolean> }>();

export function hasScheduledPublish(db: Pick<ScriptDb, "execute">): Promise<boolean> {
  const current = readiness.get(db);
  if (current && current.until > Date.now()) return current.pending;
  const pending = db.execute<{ ready: boolean }>(sql`select to_regclass('public.articles') is not null and exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'articles' and column_name = 'scheduled_publish_at'
  ) as ready`)
    .then((rows) => rows[0]?.ready === true)
    .catch(() => false);
  readiness.set(db, { until: Date.now() + 60_000, pending });
  pending.catch(() => readiness.delete(db));
  return pending;
}

/** Publishes drafts whose Bulgarian instant has arrived. `now()` is absolute; the server TimeZone is not used. */
export async function publishDueScheduled(db: ScriptDb, onlyArticleId?: string): Promise<number> {
  if (!await hasScheduledPublish(db)) return 0;
  const due = await db
    .select({ id: articles.id, at: articles.scheduledPublishAt })
    .from(articles)
    .where(and(sql`${articles.scheduledPublishAt} is not null`, sql`${articles.scheduledPublishAt} <= now()`, eq(articles.isPublic, false), onlyArticleId ? eq(articles.id, onlyArticleId) : undefined))
    .limit(20);
  let published = 0;
  for (const row of due) {
    const ok = await db.transaction(async (tx) => {
      const [article] = await tx.select().from(articles).where(and(eq(articles.id, row.id), sql`${articles.scheduledPublishAt} <= now()`, eq(articles.isPublic, false), onlyArticleId ? eq(articles.id, onlyArticleId) : undefined)).for("update").limit(1);
      if (!article?.scheduledPublishAt || article.isPublic) return false;
      const [revision] = await tx.select().from(articleRevisions).where(eq(articleRevisions.articleId, article.id)).orderBy(desc(articleRevisions.number)).limit(1);
      if (!revision) return false;
      const parsed = articleBody.safeParse(revision.body);
      if (!parsed.success || publicationProblems({ ...revision, bodyBlocks: parsed.data.length }).length) return false;
      if (!await qaPublicationAllowed(tx, article.id, revision.title, revision.slug)) return false;
      if (article.publishedAt && revision.slug !== article.slug) return false;
      const mediaIds = [...new Set([revision.heroMediaId, ...parsed.data.flatMap(block => block.type === "image" ? [block.mediaAssetId] : [])].filter((id): id is string => !!id))];
      for (const mediaId of mediaIds) { const [asset] = await tx.select({ id: mediaAssets.id }).from(mediaAssets).where(eq(mediaAssets.id, mediaId)).limit(1); if (!asset) return false; }
      const path = `/${revision.slug}/`;
      const [taken] = await tx.select({ id: articles.id }).from(articles).where(and(eq(articles.path, path), sql`${articles.id} <> ${article.id}`)).limit(1);
      const [takenCategory] = await tx.select({ id: categories.id }).from(categories).where(eq(categories.path, path)).limit(1);
      if (taken || takenCategory) return false;
      const [category] = await tx.select({ slug: categories.slug }).from(categories).where(eq(categories.id, revision.primaryCategoryId!)).limit(1);
      if (!category) return false;
      const version = article.version + 1;
      await tx.update(articles).set({
        title: revision.title,
        slug: revision.slug,
        path,
        excerpt: revision.excerpt,
        body: parsed.data,
        heroMediaId: revision.heroMediaId,
        heroEmbedUrl: revision.heroEmbedUrl,
        authorKind: revision.authorKind,
        authorUserId: revision.authorUserId,
        authorName: revision.authorName,
        primaryCategoryId: revision.primaryCategoryId,
        isPublic: true,
        publishedAt: article.publishedAt ?? article.scheduledPublishAt,
        listenEnabled: (await revisionListen(tx, article.id, revision.number)) ?? article.listenEnabled,
        scheduledPublishAt: null,
        version,
        publishedRevision: revision.number,
        updatedAt: sql`now()`,
      }).where(eq(articles.id, article.id));
      await tx.delete(articleCategories).where(eq(articleCategories.articleId, article.id));
      await tx.insert(articleCategories).values({ articleId: article.id, categoryId: revision.primaryCategoryId! });
      await applyArticlePublishViews(tx, article.id);
      await tx.insert(outboxEvents).values({
        type: article.publishedAt ? "article.updated" : "article.published",
        entityId: article.id,
        version,
        payload: { path, title: revision.title, topics: [category.slug] },
      });
      return true;
    });
    if (ok) published += 1;
  }
  return published;
}
