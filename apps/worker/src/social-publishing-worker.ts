import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, stat, writeFile, readdir, unlink } from "node:fs/promises";
import { dirname, isAbsolute, resolve, sep } from "node:path";
import sharp from "sharp";
import { and, asc, eq, inArray, lte, sql } from "drizzle-orm";
import { articles, articleRevisions, socialConnections, socialPublications, type ScriptDb, findRepoRoot } from "@newspoint/db/node";
import { hasSocialPublishing } from "@newspoint/db/social-publishing";
import { mediaFile, readMediaFile } from "@newspoint/content/upload-media";
import { socialArticleUrl } from "@newspoint/content";
import { FacebookClient, FacebookError, facebookPermalink } from "@newspoint/content/facebook";
import { MakeSocialClient, MakeSocialError, makeSocialConfiguration } from "@newspoint/content/make-social";
import { decryptSocialSecret, pageSecretContext } from "@newspoint/content/social-secrets";
import { renderFacebookPostImage } from "./facebook-post-image";

type Job = typeof socialPublications.$inferSelect;
const LEASE_MS = 120_000;
const RETRIES = [30_000, 120_000, 600_000, 1_800_000, 7_200_000, 21_600_000];
const inside = (root: string, path: string) => path === root || path.startsWith(root + sep);
function socialTempRoot(): string {
  const media = process.env.MEDIA_ROOT;
  if (!media) throw new FacebookError("image");
  const configured = process.env.SOCIAL_PUBLISHING_TEMP_ROOT;
  if (configured && !isAbsolute(configured)) throw new FacebookError("image");
  const root = resolve(configured || resolve(dirname(media), ".newspoint-social"));
  if (inside(resolve(media), root) || inside(resolve(findRepoRoot()), root)) throw new FacebookError("image");
  return root;
}
export async function prepareSocialPhoto(job: Job, title: string): Promise<{ preparedFile: string; preparedHash: string }> {
  if (!job.storageKey || !/^news\//.test(job.storageKey)) throw new FacebookError("image");
  const path = mediaFile(job.storageKey);
  // Production is local disk; laptop SSH uses the existing direct remote-file transport.
  if (!process.env.MEDIA_SSH_TARGET) {
    const info = path ? await stat(path).catch(() => null) : null;
    if (!info?.isFile() || info.size > 32 * 1024 * 1024) throw new FacebookError("image");
  }
  const source = await readMediaFile(job.storageKey);
  if (!source || source.length > 32 * 1024 * 1024) throw new FacebookError("image");
  let bytes: Buffer;
  try {
    bytes = await renderFacebookPostImage(source, title);
    if (bytes.length > 4 * 1024 * 1024) bytes = await sharp(bytes).jpeg({ quality: 70, mozjpeg: true }).toBuffer();
    if (bytes.length > 4 * 1024 * 1024) throw new Error();
  } catch { throw new FacebookError("image"); }
  const root = socialTempRoot(); await mkdir(root, { recursive: true, mode: 0o700 });
  const hash = createHash("sha256").update(bytes).digest("hex");
  const name = `${job.id}-${hash}.jpg`;
  const temporary = resolve(root, `${randomUUID()}.tmp`);
  await writeFile(temporary, bytes, { mode: 0o600 }); await rename(temporary, resolve(root, name));
  return { preparedFile: name, preparedHash: hash };
}
async function preparedPhoto(job: Job): Promise<Buffer> {
  if (!job.preparedFile || !/^[a-f0-9-]{36}-[a-f0-9]{64}\.jpg$/.test(job.preparedFile)) throw new FacebookError("image");
  const bytes = await readFile(resolve(socialTempRoot(), job.preparedFile)).catch(() => null);
  if (!bytes || bytes.length > 4 * 1024 * 1024 || createHash("sha256").update(bytes).digest("hex") !== job.preparedHash) throw new FacebookError("image");
  return bytes;
}

export async function claimSocialJob(db: ScriptDb): Promise<Job | null> {
  return db.transaction(async tx => {
    // A vanished sender may already have written to Meta. Never replay its POST blindly.
    await tx.execute(sql`update social_publications set status='uncertain',error_code='lost_response',lease_token=null,lease_until=null,updated_at=now()
      where status='sending' and lease_until < now()`);
    await tx.execute(sql`update social_publications set status='pending',lease_token=null,lease_until=null
      where status='working' and lease_until < now()`);
    const [job] = await tx.select().from(socialPublications).where(and(
      inArray(socialPublications.status, ["pending", "retry", "uncertain"]), lte(socialPublications.nextAttemptAt, new Date()),
      sql`(${socialPublications.leaseUntil} is null or ${socialPublications.leaseUntil} < now())`,
    )).orderBy(asc(socialPublications.nextAttemptAt)).limit(1).for("update", { skipLocked: true });
    if (!job) return null;
    const [claimed] = await tx.update(socialPublications).set({ status: job.status === "uncertain" ? "uncertain" : "working",
      leaseToken: randomUUID(), leaseUntil: new Date(Date.now() + LEASE_MS), updatedAt: new Date(),
    }).where(eq(socialPublications.id, job.id)).returning();
    return claimed ?? null;
  });
}

export async function processSocialJob(db: ScriptDb, job: Job, dependencies: {
  client?: FacebookClient; makeClient?: MakeSocialClient; photo?: (job: Job) => Promise<Buffer>;
} = {}): Promise<void> {
  const owned = and(eq(socialPublications.id, job.id), eq(socialPublications.leaseToken, job.leaseToken!), sql`${socialPublications.leaseUntil} > now()`);
  const finish = async (values: Partial<typeof socialPublications.$inferInsert>) => {
    const history = { at: new Date().toISOString(), status: values.status ?? job.status, step: values.step ?? job.step, ...(values.errorCode ? { code: values.errorCode } : {}) };
    const rows = await db.update(socialPublications).set({ ...values, updatedAt: new Date(), leaseToken: null, leaseUntil: null,
      history: sql`${socialPublications.history} || ${JSON.stringify([history])}::jsonb`,
    }).where(owned).returning({ id: socialPublications.id });
    return rows.length > 0;
  };
  let externalStarted = false;
  let generation: number | null = null;
  try {
    const [article] = job.articleId ? await db.select().from(articles).where(eq(articles.id, job.articleId)) : [];
    if (!article?.isPublic || !article.publishedAt || article.publishedAt > new Date()) {
      await finish({ status: job.status === "uncertain" ? "uncertain" : "cancelled", errorCode: "not_public", nextAttemptAt: new Date(Date.now() + 86400_000) }); return;
    }
    const makeMode = process.env.SOCIAL_PUBLISHING_PROVIDER === "make";
    const makeConfig = makeMode ? makeSocialConfiguration() : null;
    const [connection] = makeMode ? [] : await db.select().from(socialConnections).where(eq(socialConnections.provider, "facebook"));
    if (makeMode ? !makeConfig || makeConfig.pageId !== job.pageId : !connection || connection.status !== "connected" || connection.pageId !== job.pageId) throw new FacebookError("connection");
    generation = connection?.generation ?? null;
    const client = makeMode ? null : dependencies.client ?? new FacebookClient(decryptSocialSecret(connection!.encryptedToken, pageSecretContext(connection!.pageId)));
    const makeClient = makeMode ? dependencies.makeClient ?? MakeSocialClient.configured() : null;
    if (!socialArticleUrl(new URL(job.articleUrl).origin, new URL(job.articleUrl).pathname)) throw new FacebookError("origin");
    if (job.status === "uncertain") {
      if (makeMode) {
        // The webhook may have completed after the response was lost. Never replay it blindly.
        await finish({ status: "uncertain", errorCode: "review", nextAttemptAt: new Date(Date.now() + 3600_000) }); return;
      }
      if (job.step === "comment" && job.postId) {
        const comments = await client!.comments(job.postId);
        const matches = comments.filter(c => c.from?.id === job.pageId && c.message === job.articleUrl);
        if (matches.length === 1) { await finish({ status: "succeeded", commentId: matches[0]!.id, errorCode: null }); return; }
      }
      if (job.photoId) {
        const postId = job.postId ?? await client!.photoPost(job.photoId);
        if (postId && job.step !== "comment") { await finish({ status: "pending", step: "comment", postId, attempts: 0, errorCode: null, nextAttemptAt: new Date() }); return; }
      }
      // Unknown photos require explicit admin reconciliation; do not fetch unused candidates.
      await finish({ status: "uncertain", errorCode: "review", nextAttemptAt: new Date(Date.now() + 3600_000) }); return;
    }
    if (job.step === "prepare") {
      if (!job.text.trim()) throw new FacebookError("text");
      const [revision] = await db.select({ title: articleRevisions.title }).from(articleRevisions)
        .where(and(eq(articleRevisions.articleId, job.articleId!), eq(articleRevisions.number, job.revision)));
      if (!revision?.title.trim()) throw new FacebookError("text");
      const prepared = await prepareSocialPhoto(job, revision.title);
      await finish({ ...prepared, status: "pending", step: "photo", attempts: 0, errorCode: null, nextAttemptAt: new Date() }); return;
    }
    if (job.step === "resolve") {
      if (makeMode) throw new MakeSocialError("review");
      if (!job.photoId) throw new FacebookError("review");
      const postId = await client!.photoPost(job.photoId);
      if (!postId) throw new FacebookError("post_pending", true);
      const post = await client!.post(postId);
      await finish({ status: "pending", step: "comment", postId, permalink: facebookPermalink(post.permalink_url), attempts: 0, errorCode: null, nextAttemptAt: new Date() }); return;
    }
    const bytes = job.step === "photo" ? await (dependencies.photo ?? preparedPhoto)(job) : null;
    if (process.env.SOCIAL_PUBLISHING_ENABLED !== "1") { await finish({ status: "pending", nextAttemptAt: new Date(Date.now() + 60_000) }); return; }
    if (job.step === "comment" && !job.postId) throw new FacebookError("review");
    const connectionFence = makeMode
      ? sql`${makeConfig?.pageId ?? "unconnected"} = ${job.pageId}`
      : sql`exists(select 1 from social_connections where provider='facebook' and status='connected' and page_id=${job.pageId} and generation=${generation})`;
    const started = await db.update(socialPublications).set({ status: "sending", operationStartedAt: new Date(), attempts: job.attempts + 1, updatedAt: new Date() }).where(and(owned,
      connectionFence,
      sql`exists(select 1 from articles where id=${job.articleId}::uuid and is_public=true)`,
    )).returning({ id: socialPublications.id });
    if (!started.length) return;
    externalStarted = true;
    if (makeMode && job.step === "photo") {
      const result = await makeClient!.publish({ jobId: job.id, message: job.text, articleUrl: job.articleUrl, photo: bytes! });
      await finish({ postId: result.postId, commentId: result.commentId, permalink: result.permalink ?? `https://www.facebook.com/${result.postId}`,
        status: "succeeded", attempts: 0, errorCode: null });
    } else if (makeMode) {
      const result = await makeClient!.comment({ jobId: job.id, articleUrl: job.articleUrl, postId: job.postId! });
      await finish({ postId: result.postId, commentId: result.commentId, permalink: result.permalink ?? job.permalink,
        status: "succeeded", attempts: 0, errorCode: null });
    } else if (job.step === "photo") {
      const result = await client!.uploadPhoto(job.pageId, job.text, bytes!);
      await finish({ ...result, status: "pending", step: "resolve", attempts: 0, errorCode: null, nextAttemptAt: new Date() });
    } else {
      const commentId = await client!.comment(job.postId!, job.articleUrl);
      await finish({ commentId, status: "succeeded", attempts: 0, errorCode: null });
    }
  } catch (error) {
    if (error instanceof MakeSocialError && error.postId && job.step === "photo") {
      await finish({ postId: error.postId, permalink: `https://www.facebook.com/${error.postId}`, status: "retry", step: "comment", attempts: 0,
        errorCode: error.code, traceId: error.traceId, nextAttemptAt: new Date(Date.now() + Math.max(error.retryAfter, RETRIES[0]!)) });
      return;
    }
    // COMMIT/DB errors following a successful POST must remain ambiguous, never retryable.
    const failure = error instanceof FacebookError || error instanceof MakeSocialError ? error : new FacebookError(externalStarted ? "lost_response" : "internal", true, externalStarted);
    if (failure.code === "connection" && process.env.SOCIAL_PUBLISHING_PROVIDER !== "make") {
      await db.update(socialConnections).set({ status: "invalid", updatedAt: new Date() })
        .where(and(eq(socialConnections.provider, "facebook"), eq(socialConnections.pageId, job.pageId), generation !== null ? eq(socialConnections.generation, generation) : undefined));
    }
    const uncertain = job.status === "uncertain" || failure.uncertain;
    const attempt = job.attempts + 1;
    const retryable = !uncertain && failure.retryable && attempt <= RETRIES.length && Date.now() - job.createdAt.getTime() < 86400_000;
    const wait = Math.max(failure.retryAfter, (RETRIES[Math.min(attempt - 1, RETRIES.length - 1)] ?? 3600_000) * (1 + Math.random() * 0.15));
    await finish({ status: uncertain ? "uncertain" : retryable ? "retry" : "failed", attempts: attempt,
      errorCode: failure.code, traceId: failure.traceId, nextAttemptAt: new Date(Date.now() + (uncertain ? 3600_000 : wait)),
      // A definitive API rejection did not create an object. Input may safely be corrected.
      ...(!uncertain && externalStarted && job.step === "photo" ? { operationStartedAt: null } : {}),
    });
  }
}

async function checkConnection(db: ScriptDb) {
  if (process.env.SOCIAL_PUBLISHING_PROVIDER === "make") return;
  const [connection] = await db.select().from(socialConnections).where(eq(socialConnections.provider, "facebook"));
  if (!connection || connection.status !== "connected" || connection.checkedAt && Date.now() - connection.checkedAt.getTime() < 3600_000) return;
  try {
    const page = await new FacebookClient(decryptSocialSecret(connection.encryptedToken, pageSecretContext(connection.pageId))).page(connection.pageId);
    if (page.id !== connection.pageId) throw new FacebookError("connection");
    await db.update(socialConnections).set({ checkedAt: new Date() }).where(and(eq(socialConnections.provider, "facebook"), eq(socialConnections.generation, connection.generation)));
  } catch (error) {
    if (error instanceof FacebookError && error.code === "connection") await db.update(socialConnections).set({ status: "invalid", checkedAt: new Date() }).where(and(eq(socialConnections.provider, "facebook"), eq(socialConnections.generation, connection.generation)));
  }
}
async function cleanPreparedPhotos(db: ScriptDb) {
  const root = socialTempRoot(); const entries = await readdir(root).catch(() => []);
  const old = Date.now() - 7 * 86400_000;
  for (const name of entries) {
    if (!/^(?:[a-f0-9-]{36}-[a-f0-9]{64}\.jpg|[a-f0-9-]{36}\.tmp)$/.test(name)) continue;
    const path = resolve(root, name); const info = await stat(path).catch(() => null);
    if (!info || info.mtimeMs > old) continue;
    const [active] = await db.select({ id: socialPublications.id }).from(socialPublications).where(and(eq(socialPublications.preparedFile, name), sql`${socialPublications.status} not in ('succeeded','cancelled')`)).limit(1);
    if (!active) await unlink(path).catch(() => undefined);
  }
}
export function startSocialPublishingWorker(db: ScriptDb, log: (message: string) => void) {
  let stopped = false; let timer: ReturnType<typeof setTimeout> | undefined; let running: Promise<void> = Promise.resolve(); let warned = 0; let maintained = 0;
  async function tick() {
    try {
      if (process.env.SOCIAL_PUBLISHING_ENABLED === "1" && await hasSocialPublishing(db)) {
        if (Date.now() - maintained > 3600_000) { await checkConnection(db); await cleanPreparedPhotos(db); maintained = Date.now(); }
        const job = await claimSocialJob(db); if (job) await processSocialJob(db, job);
      }
    } catch {
      if (Date.now() - warned > 60_000) { log("Facebook: processing paused; check social configuration and database. No credentials logged."); warned = Date.now(); }
    } finally { if (!stopped) timer = setTimeout(() => { running = tick(); }, 2000); }
  }
  running = tick();
  return async () => { stopped = true; clearTimeout(timer); await running; };
}
