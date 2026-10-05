import { randomUUID } from "node:crypto";
import { and, asc, eq, lt, lte, or, sql } from "drizzle-orm";
import webpush from "web-push";
import { articleCategories, articles, categories, pushDeliveries, pushJobs, pushRateLimits, pushSubscriptions, type ScriptDb } from "@newspoint/db/node";
import { readPushConfiguration } from "@newspoint/db/push-configuration";
import { isAllowedPushEndpoint, makePushPayload, pushFilterMatches, pushRetry, readerNotificationUrl } from "@newspoint/db/push-domain";

const LEASE_MS = 120_000;
const BATCH = 25;
type Delivery = typeof pushDeliveries.$inferSelect;

/** Row lock and INSERT SELECT keep fan-out atomic and independent of browsers. */
export async function expandPushJob(db: ScriptDb): Promise<boolean> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`set local statement_timeout = '20s'`);
    const [job] = await tx.select().from(pushJobs).where(eq(pushJobs.status, "pending"))
      .orderBy(asc(pushJobs.createdAt)).limit(1).for("update", { skipLocked: true });
    if (!job) return false;
    let categorySlugs: string[] = [];
    let eligible = job.expiresAt.getTime() > Date.now();
    if (job.kind === "article") {
      const [article] = await tx.select({ public: articles.isPublic, publishedAt: articles.publishedAt, slug: categories.slug })
        .from(articles).leftJoin(categories, eq(categories.id, articles.primaryCategoryId)).where(eq(articles.id, job.articleId!));
      eligible &&= Boolean(article?.public && article.publishedAt && article.publishedAt.getTime() <= Date.now()
        && article.publishedAt.getTime() >= job.createdAt.getTime() - 3600_000);
      const extra = await tx.select({ slug: categories.slug }).from(articleCategories)
        .innerJoin(categories, eq(categories.id, articleCategories.categoryId)).where(eq(articleCategories.articleId, job.articleId!));
      categorySlugs = [...new Set([...(article?.slug ? [article.slug] : []), ...extra.map((row) => row.slug)])];
    }
    if (eligible) {
      await tx.execute(sql`
        insert into push_deliveries (job_id, subscription_id)
        select ${job.id}::uuid, s.id from push_subscriptions s
        where s.enabled = true
          and s.enabled_at <= ${job.createdAt.toISOString()}::timestamptz
          and (${job.kind} = 'test' and s.id = ${job.subscriptionId}::uuid
            or ${job.kind} = 'article' and (
              s.category_slugs is null and s.category_slug is null
              or exists (select 1 from jsonb_array_elements_text(${JSON.stringify(categorySlugs)}::jsonb) c(slug)
                where s.category_slugs is not null and s.category_slugs ? c.slug
                  or s.category_slugs is null and s.category_slug = c.slug)))
        on conflict (job_id, subscription_id) do nothing`);
    }
    await tx.update(pushJobs).set({ status: eligible ? "expanded" : "skipped" }).where(eq(pushJobs.id, job.id));
    return true;
  });
}

export async function claimPushDeliveries(db: ScriptDb): Promise<Delivery[]> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`set local statement_timeout = '20s'`);
    const now = new Date();
    const rows = await tx.select().from(pushDeliveries).where(or(
      and(eq(pushDeliveries.status, "pending"), lte(pushDeliveries.dueAt, now)),
      and(eq(pushDeliveries.status, "sending"), lt(pushDeliveries.leaseUntil, now)),
    )).orderBy(asc(pushDeliveries.dueAt)).limit(BATCH).for("update", { skipLocked: true });
    const claimed: Delivery[] = [];
    for (const row of rows) {
      const [updated] = await tx.update(pushDeliveries).set({ status: "sending", attempts: row.attempts + 1,
        leaseToken: randomUUID(), leaseUntil: new Date(Date.now() + LEASE_MS) }).where(eq(pushDeliveries.id, row.id)).returning();
      if (updated) claimed.push(updated);
    }
    return claimed;
  });
}

type Sender = typeof webpush.sendNotification;
export async function deliverPush(db: ScriptDb, delivery: Delivery, origin: string, send: Sender = webpush.sendNotification.bind(webpush)) {
  const ownsLease = and(eq(pushDeliveries.id, delivery.id), eq(pushDeliveries.status, "sending"), eq(pushDeliveries.leaseToken, delivery.leaseToken!));
  const finish = async (values: Partial<typeof pushDeliveries.$inferInsert>) => {
    const rows = await db.update(pushDeliveries).set({ ...values, leaseUntil: null, leaseToken: null }).where(ownsLease).returning({ id: pushDeliveries.id });
    return rows.length > 0;
  };
  // Re-read opt-out, category filters and publication after claiming the job.
  const [row] = await db.select({ subscription: pushSubscriptions, job: pushJobs, title: articles.title,
    path: articles.path, public: articles.isPublic, publishedAt: articles.publishedAt, slug: categories.slug })
    .from(pushDeliveries).innerJoin(pushJobs, eq(pushJobs.id, pushDeliveries.jobId))
    .innerJoin(pushSubscriptions, eq(pushSubscriptions.id, pushDeliveries.subscriptionId))
    .leftJoin(articles, eq(articles.id, pushJobs.articleId)).leftJoin(categories, eq(categories.id, articles.primaryCategoryId))
    .where(ownsLease);
  if (!row) return;
  const { job, subscription } = row;
  const url = readerNotificationUrl(job.kind === "test" ? "/" : row.path ?? "", origin);
  const extra = job.articleId ? await db.select({ slug: categories.slug }).from(articleCategories)
    .innerJoin(categories, eq(categories.id, articleCategories.categoryId)).where(eq(articleCategories.articleId, job.articleId)) : [];
  const slugs = [...new Set([...(row.slug ? [row.slug] : []), ...extra.map((entry) => entry.slug)])];
  if (!subscription.enabled || !subscription.enabledAt || subscription.enabledAt.getTime() > job.createdAt.getTime()
    || job.expiresAt.getTime() <= Date.now() || delivery.attempts > 6
    || !isAllowedPushEndpoint(subscription.endpoint) || !url
    || (job.kind === "article" && (!row.public || !row.publishedAt || row.publishedAt.getTime() > Date.now()
      || row.publishedAt.getTime() < job.createdAt.getTime() - 3600_000
      || !pushFilterMatches(subscription.categorySlugs, subscription.categorySlug, slugs)))) {
    await finish({ status: "skipped", errorCode: "ineligible" });
    return;
  }
  const payload = makePushPayload(job.kind === "test" ? "NewsPoint — тестово известие" : row.title!,
    job.kind === "test" ? "Известията работят на това устройство. Докоснете, за да отворите NewsPoint." : "Нова публикация в NewsPoint.bg",
    url, `np-${job.kind}-${job.kind === "test" ? job.id : job.articleId}`);
  const encoded = JSON.stringify(payload);
  // RFC 8291 leaves 3993 bytes for plaintext in a 4096-byte encrypted record.
  // Preserve the canonical URL; an exceptional oversized article is not retried.
  if (Buffer.byteLength(encoded) > 3993) {
    await finish({ status: "failed", errorCode: "payload_too_large" });
    return;
  }
  try {
    await send({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, encoded,
      { TTL: Math.max(1, Math.ceil((job.expiresAt.getTime() - Date.now()) / 1000)), urgency: "normal", timeout: 15_000 });
    if (await finish({ status: "accepted", acceptedAt: new Date(), errorCode: null })) {
      await db.update(pushSubscriptions).set({ lastNotifiedAt: new Date() }).where(eq(pushSubscriptions.id, subscription.id));
    }
  } catch (error) {
    const failure = error as { statusCode?: number; headers?: Record<string, string> };
    const outcome = pushRetry(delivery.attempts, failure.statusCode, failure.headers?.["retry-after"], Date.now(), job.expiresAt.getTime());
    if (outcome.kind === "gone") {
      if (await finish({ status: "failed", lastStatus: failure.statusCode, errorCode: "expired_subscription" })) {
        await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, subscription.id));
      }
    } else {
      await finish({ status: outcome.kind === "retry" ? "pending" : "failed", lastStatus: failure.statusCode ?? null,
        errorCode: failure.statusCode ? `push_${failure.statusCode}` : "transport_error",
        ...(outcome.kind === "retry" ? { dueAt: new Date(outcome.dueAt) } : {}) });
    }
  }
}

/** Starts no connection itself; shares the supervised worker's pool. */
export function startPushWorker(db: ScriptDb, log: (message: string) => void) {
  let stopped = false;
  let running: Promise<void> = Promise.resolve();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let lastWarning = 0;
  let lastMaintenance = 0;
  async function tick() {
    let backlog = false;
    try {
      const config = readPushConfiguration();
      if (!config) throw new Error("Configure WEB_URL and VAPID keys for reader push");
      webpush.setVapidDetails(config.subject, config.publicKey, config.privateKey);
      // Missing migration must not stop sync/scheduled publication.
      if (Date.now() - lastMaintenance > 60_000) {
        await db.update(pushJobs).set({ status: "skipped" }).where(and(eq(pushJobs.status, "pending"), lte(pushJobs.expiresAt, new Date())));
        await db.execute(sql`update push_deliveries d set status = 'skipped', error_code = 'expired', lease_token = null, lease_until = null
          from push_jobs j where d.job_id = j.id and j.expires_at <= now()
          and (d.status = 'pending' or d.status = 'sending' and d.lease_until < now())`);
        await db.delete(pushJobs).where(lt(pushJobs.expiresAt, new Date(Date.now() - 7 * 86400_000)));
        await db.delete(pushRateLimits).where(lt(pushRateLimits.windowStart, new Date(Date.now() - 3600_000)));
        lastMaintenance = Date.now();
      }
      for (let i = 0; i < 5 && !stopped; i++) if (!(await expandPushJob(db))) break;
      if (!stopped) {
        const claimed = await claimPushDeliveries(db);
        const results = await Promise.allSettled(claimed.map((row) => deliverPush(db, row, config.origin)));
        if (results.some((result) => result.status === "rejected")) throw new Error("Delivery state unavailable");
        backlog = claimed.length === BATCH;
      }
    } catch {
      if (Date.now() - lastWarning > 60_000) {
        log("reader push paused: check migration 27, database, WEB_URL and VAPID configuration (no subscription details logged)");
        lastWarning = Date.now();
      }
    } finally {
      if (!stopped) timer = setTimeout(() => { running = tick(); }, backlog ? 50 : 2000);
    }
  }
  running = tick();
  return async () => { stopped = true; clearTimeout(timer); await running; };
}
