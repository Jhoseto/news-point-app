import { and, desc, eq, sql } from "drizzle-orm";
import type { ScriptDb } from "./node";
import { articleRevisions, articles, categories, outboxEvents } from "./schema";

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const RESERVED = new Set(["api", "_next", "brand", "draft", "login", "search", "tag", "author", "page", "feed", "share", "sitemap.xml", "wp-admin", "wp-content", "wp-json", "admin", "media"]);

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
export async function publishDueScheduled(db: ScriptDb): Promise<number> {
  if (!await hasScheduledPublish(db)) return 0;
  const due = await db
    .select({ id: articles.id, at: articles.scheduledPublishAt })
    .from(articles)
    .where(and(sql`${articles.scheduledPublishAt} is not null`, sql`${articles.scheduledPublishAt} <= now()`, eq(articles.isPublic, false)))
    .limit(20);
  let published = 0;
  for (const row of due) {
    const ok = await db.transaction(async (tx) => {
      const [article] = await tx.select().from(articles).where(eq(articles.id, row.id)).for("update").limit(1);
      if (!article?.scheduledPublishAt || article.isPublic) return false;
      const [revision] = await tx.select().from(articleRevisions).where(eq(articleRevisions.articleId, article.id)).orderBy(desc(articleRevisions.number)).limit(1);
      if (!revision) return false;
      const body = Array.isArray(revision.body) ? revision.body : [];
      if (revision.title.trim().length < 5 || !SLUG.test(revision.slug) || RESERVED.has(revision.slug) || !revision.primaryCategoryId || !revision.heroMediaId || body.length === 0) return false;
      const path = `/${revision.slug}/`;
      const [taken] = await tx.select({ id: articles.id }).from(articles).where(and(eq(articles.path, path), sql`${articles.id} <> ${article.id}`)).limit(1);
      const [takenCategory] = await tx.select({ id: categories.id }).from(categories).where(eq(categories.path, path)).limit(1);
      if (taken || takenCategory) return false;
      const [category] = await tx.select({ slug: categories.slug }).from(categories).where(eq(categories.id, revision.primaryCategoryId)).limit(1);
      if (!category) return false;
      const version = article.version + 1;
      await tx.update(articles).set({
        title: revision.title,
        slug: revision.slug,
        path,
        excerpt: revision.excerpt,
        body: revision.body,
        heroMediaId: revision.heroMediaId,
        heroEmbedUrl: revision.heroEmbedUrl,
        authorKind: revision.authorKind,
        authorUserId: revision.authorUserId,
        authorName: revision.authorName,
        primaryCategoryId: revision.primaryCategoryId,
        isPublic: true,
        publishedAt: article.scheduledPublishAt,
        scheduledPublishAt: null,
        version,
        publishedRevision: revision.number,
        updatedAt: sql`now()`,
      }).where(eq(articles.id, article.id));
      await tx.insert(outboxEvents).values({
        type: "article.published",
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
