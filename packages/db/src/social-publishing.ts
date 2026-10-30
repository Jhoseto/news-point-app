import { and, desc, eq, sql } from "drizzle-orm";
import { defaultSocial, facebookPodcastText, isPodcastSocialCover, normalizeSocial, socialArticleUrl, socialPodcastUrl, socialMessage, podcastSocialMessage, type SocialInput, type SocialStatus } from "@newspoint/content";
import { makeSocialConfiguration } from "@newspoint/content/make-social";
import type { ScriptDb } from "./node";
import { articles, articleRevisions, mediaAssets, podcasts, podcastSocialPublications, socialConnections, socialPublications } from "./schema";
import { enqueueInstagramPublication, readInstagramRevision, writeInstagramRevision, readInstagramStatus } from "./instagram-publishing";

type Executor = Pick<ScriptDb, "execute">;
type SocialPage = { pageId: string; name: string; connected: boolean; provider: "facebook" | "make" };
async function activeSocialPage(db: Pick<ScriptDb, "select">): Promise<SocialPage> {
  if (process.env.SOCIAL_PUBLISHING_PROVIDER === "make") {
    const configured = makeSocialConfiguration();
    return { pageId: configured?.pageId ?? "unconnected", name: configured?.pageName ?? "Make", connected: Boolean(configured), provider: "make" };
  }
  const [connection] = await db.select({ pageId: socialConnections.pageId, name: socialConnections.name, status: socialConnections.status })
    .from(socialConnections).where(eq(socialConnections.provider, "facebook"));
  return { pageId: connection?.pageId ?? "unconnected", name: connection?.name ?? "Facebook", connected: connection?.status === "connected", provider: "facebook" };
}
export async function hasSocialPublishing(db: Executor): Promise<boolean> {
  const rows = await db.execute<{ ready: boolean }>(sql`select to_regclass('public.article_revision_social') is not null
    and to_regclass('public.social_connections') is not null and to_regclass('public.social_publications') is not null
    and to_regclass('public.social_oauth_states') is not null and to_regclass('public.social_deletion_receipts') is not null as ready`);
  return rows[0]?.ready === true;
}
export async function readRevisionSocial(db: Executor, id: string, revision: number, title: string): Promise<SocialInput> {
  if (!await hasSocialPublishing(db)) return defaultSocial(title);
  const rows = await db.execute<{ enabled: boolean; text: string; text_mode: "auto" | "custom" }>(sql`
    select enabled,text,text_mode from article_revision_social where article_id=${id}::uuid and revision=${revision} and provider='facebook'`);
  const row = rows[0];
  const social = row ? normalizeSocial({ facebook: { enabled: row.enabled, text: row.text, textMode: row.text_mode } }, title) : defaultSocial(title);
  const instagram = await readInstagramRevision(db, id, revision, title);
  return instagram ? { ...social, instagram } : social;
}
export async function writeRevisionSocial(db: Executor, id: string, revision: number, title: string, input: SocialInput | undefined, previousRevision = 0): Promise<void> {
  await writeInstagramRevision(db, id, revision, title, input?.instagram, previousRevision);
  if (!await hasSocialPublishing(db)) {
    if (input?.facebook.enabled || input?.facebook.textMode === "custom") throw new Error("Социалното публикуване изисква миграция 39.");
    return;
  }
  const previous = input ?? (previousRevision ? await readRevisionSocial(db, id, previousRevision, title) : undefined);
  const { facebook: value } = normalizeSocial(previous, title);
  await db.execute(sql`insert into article_revision_social(article_id,revision,provider,enabled,text,text_mode)
    values(${id}::uuid,${revision},'facebook',${value.enabled},${value.text},${value.textMode})`);
}

/** Caller holds the article lock. Explicit Studio revision intent only; never WP/outbox fan-out. */
export async function enqueueSocialPublication(db: Pick<ScriptDb, "execute" | "select" | "insert">, id: string, revision: number): Promise<void> {
  if (!await hasSocialPublishing(db)) return;
  const [article] = await db.select().from(articles).where(eq(articles.id, id));
  if (!article?.isPublic || !article.publishedAt || article.publishedAt > new Date() || article.publishedRevision !== revision
    || article.title.startsWith("[QA editor]") || article.slug.startsWith("qa-editor-") || process.env.EDITOR_QA_RUN_ID) return;
  const qa = await db.execute<{ ready: boolean }>(sql`select to_regclass('public.editor_qa_articles') is not null as ready`);
  if (qa[0]?.ready) {
    const excluded = await db.execute(sql`select 1 from editor_qa_articles where article_id=${id}::uuid`);
    if (excluded.length) return;
  }
  await enqueueInstagramPublication(db, id, revision);
  const { facebook } = await readRevisionSocial(db, id, revision, article.title);
  if (!facebook.enabled) return;
  const [existing] = await db.select({ id: socialPublications.id }).from(socialPublications).where(eq(socialPublications.articleId, id)).limit(1);
  if (existing) return; // Includes a task created before the Page was connected.
  const connection = await activeSocialPage(db);
  const [media] = article.heroMediaId ? await db.select().from(mediaAssets).where(eq(mediaAssets.id, article.heroMediaId)) : [];
  const url = socialArticleUrl(process.env.WEB_URL, article.path);
  const error = !url ? "origin" : !facebook.text.trim() ? "text" : !media?.storageKey || article.heroEmbedUrl ? "image" : !connection.connected ? "connection" : null;
  await db.insert(socialPublications).values({ articleId: id, revision, pageId: connection.pageId,
    text: facebook.text, articleUrl: url ?? "", mediaId: article.heroMediaId, storageKey: media?.storageKey,
    status: error ? "failed" : "pending", errorCode: error,
  }).onConflictDoNothing();
}

export async function readSocialStatus(db: ScriptDb, id?: string): Promise<SocialStatus> {
  const ready = await hasSocialPublishing(db);
  if (!ready) return { ready: false, connected: false, enabled: false, job: null };
  const connection = await activeSocialPage(db);
  const [job] = id ? await db.select().from(socialPublications).where(eq(socialPublications.articleId, id)).orderBy(desc(socialPublications.createdAt)).limit(1) : [];
  return { ready, connected: connection.connected, enabled: process.env.SOCIAL_PUBLISHING_ENABLED === "1", instagram: await readInstagramStatus(db, id), job: job ? {
    id: job.id, status: job.status, step: job.step, text: job.text, url: job.permalink,
    message: socialMessage(job.status, job.step, job.errorCode), canRetry: job.status === "failed" && job.errorCode !== "connection",
  } : null };
}

/** Same task, same external IDs. Refresh input only when no external call could have happened. */
export async function retrySocialPublication(db: ScriptDb, id: string): Promise<boolean> {
  if (!await hasSocialPublishing(db)) return false;
  return db.transaction(async tx => {
    const [article] = await tx.select().from(articles).where(eq(articles.id, id)).for("update");
    if (!article?.isPublic) return false;
    const [job] = await tx.select().from(socialPublications).where(eq(socialPublications.articleId, id)).for("update");
    if (!job || job.status !== "failed") return false;
    const connection = await activeSocialPage(tx);
    if (!connection.connected || (job.pageId !== "unconnected" && job.pageId !== connection.pageId)) return false;
    const values: Partial<typeof socialPublications.$inferInsert> = { status: "pending", attempts: 0, nextAttemptAt: new Date(), errorCode: null, leaseToken: null, leaseUntil: null, updatedAt: new Date() };
    if (!job.photoId && !job.operationStartedAt && ["prepare", "photo"].includes(job.step)) {
      const [rev] = await tx.select().from(articleRevisions).where(and(eq(articleRevisions.articleId, id), eq(articleRevisions.number, article.publishedRevision!)));
      if (!rev) return false;
      const social = await readRevisionSocial(tx, id, rev.number, rev.title);
      const [media] = rev.heroMediaId ? await tx.select().from(mediaAssets).where(eq(mediaAssets.id, rev.heroMediaId)) : [];
      const url = socialArticleUrl(process.env.WEB_URL, article.path);
      if (!url || !social.facebook.text.trim() || !media?.storageKey || rev.heroEmbedUrl) return false;
      Object.assign(values, { revision: rev.number, text: social.facebook.text, mediaId: rev.heroMediaId, storageKey: media.storageKey,
        articleUrl: url, pageId: connection.pageId, step: "prepare", preparedFile: null, preparedHash: null });
    }
    await tx.update(socialPublications).set(values).where(eq(socialPublications.id, job.id));
    return true;
  });
}

export class PodcastSocialError extends Error {
  constructor(public status: 404 | 409 | 422 | 503, public code: string, message: string) { super(message); }
}
export async function hasPodcastSocialPublishing(db: Executor): Promise<boolean> {
  if (!await hasSocialPublishing(db)) return false;
  const rows = await db.execute<{ ready: boolean }>(sql`select to_regclass('public.podcast_social_publications') is not null as ready`);
  return rows[0]?.ready === true;
}
function podcastCanRetry(job: typeof socialPublications.$inferSelect, connection: SocialPage): boolean {
  return job.status === "failed" && job.errorCode !== "review" && connection.connected && connection.pageId === job.pageId
    && process.env.SOCIAL_PUBLISHING_ENABLED === "1" && (!job.leaseUntil || job.leaseUntil <= new Date());
}
export async function readPodcastSocialStatus(db: ScriptDb, id: string): Promise<SocialStatus> {
  if (!await hasPodcastSocialPublishing(db)) return { ready: false, connected: false, enabled: false, job: null };
  const [episode] = await db.select({ id: podcasts.id }).from(podcasts).where(eq(podcasts.id, id)).limit(1);
  if (!episode) throw new PodcastSocialError(404, "not_found", "Подкастът не е намерен.");
  const connection = await activeSocialPage(db);
  const [row] = await db.select({ job: socialPublications }).from(podcastSocialPublications)
    .innerJoin(socialPublications, eq(socialPublications.id, podcastSocialPublications.jobId))
    .where(and(eq(podcastSocialPublications.podcastId, id), connection.connected ? eq(podcastSocialPublications.pageId, connection.pageId) : undefined))
    .orderBy(desc(socialPublications.createdAt)).limit(1);
  const job = row?.job;
  return { ready: true, connected: connection.connected, enabled: process.env.SOCIAL_PUBLISHING_ENABLED === "1", job: job ? {
    id: job.id, status: job.status, step: job.step, text: job.text, url: job.permalink,
    message: podcastSocialMessage(job.status, job.step, job.errorCode), canRetry: podcastCanRetry(job, connection),
  } : null };
}
/** Explicit editor click only. Podcast locking serializes simultaneous clicks and snapshots saved copy. */
export async function sharePodcastToFacebook(db: ScriptDb, id: string, expectedRevision: number, action: "share" | "retry" = "share"): Promise<SocialStatus> {
  if (!await hasPodcastSocialPublishing(db)) throw new PodcastSocialError(503, "migration_required", "Споделянето на подкасти още не е активирано.");
  await db.transaction(async tx => {
    const [episode] = await tx.select().from(podcasts).where(eq(podcasts.id, id)).for("update");
    if (!episode) throw new PodcastSocialError(404, "not_found", "Подкастът не е намерен.");
    if (episode.status !== "published" || !episode.publishedAt || episode.publishedAt > new Date()) throw new PodcastSocialError(409, "not_public", "Първо публикувайте подкаста в сайта.");
    if (episode.revision !== expectedRevision) throw new PodcastSocialError(409, "revision_conflict", "Подкастът е променен. Презаредете преди споделяне.");
    const connection = await activeSocialPage(tx);
    if (!connection.connected) throw new PodcastSocialError(503, "connection", "Администраторът трябва да провери връзката с Facebook.");
    if (process.env.SOCIAL_PUBLISHING_ENABLED !== "1") throw new PodcastSocialError(503, "disabled", "Споделянето във Facebook в момента е спряно.");
    const [existing] = await tx.select({ job: socialPublications }).from(podcastSocialPublications)
      .innerJoin(socialPublications, eq(socialPublications.id, podcastSocialPublications.jobId))
      .where(and(eq(podcastSocialPublications.podcastId, id), eq(podcastSocialPublications.pageId, connection.pageId))).for("update");
    if (existing && action === "share") return;
    if (action === "retry" && (!existing || !podcastCanRetry(existing.job, connection))) throw new PodcastSocialError(409, "not_retryable", "Тази заявка не може да бъде изпратена повторно.");
    const url = socialPodcastUrl(process.env.WEB_URL, `/livepoint/podcast/${episode.slug}/`);
    const title = episode.title.trim();
    const text = facebookPodcastText(title, episode.summary);
    const updateSnapshot = !existing || (!existing.job.photoId && !existing.job.postId && !existing.job.operationStartedAt && ["prepare", "photo"].includes(existing.job.step));
    if (updateSnapshot) {
      if (!url) throw new PodcastSocialError(422, "origin", "Администраторът трябва да настрои публичния адрес на сайта.");
      if (title.length < 2 || !episode.summary.trim()) throw new PodcastSocialError(422, "text", "Запишете заглавие и резюме преди споделяне.");
      if (!isPodcastSocialCover(episode.coverKey)) throw new PodcastSocialError(422, "image", "Запишете валидна обложка преди споделяне.");
    }
    if (existing) {
      const values: Partial<typeof socialPublications.$inferInsert> = { status: "pending", attempts: 0, nextAttemptAt: new Date(), errorCode: null, leaseToken: null, leaseUntil: null, updatedAt: new Date() };
      if (updateSnapshot) {
        Object.assign(values, { revision: episode.revision, text, articleUrl: url!, storageKey: episode.coverKey,
          step: "prepare", preparedFile: null, preparedHash: null });
        await tx.update(podcastSocialPublications).set({ title }).where(eq(podcastSocialPublications.jobId, existing.job.id));
      }
      await tx.update(socialPublications).set(values).where(eq(socialPublications.id, existing.job.id));
      return;
    }
    const [job] = await tx.insert(socialPublications).values({ articleId: null, revision: episode.revision, pageId: connection.pageId,
      text, articleUrl: url!, storageKey: episode.coverKey, status: "pending" }).returning({ id: socialPublications.id });
    await tx.insert(podcastSocialPublications).values({ jobId: job!.id, podcastId: id, pageId: connection.pageId, title });
  });
  return readPodcastSocialStatus(db, id);
}
