import { randomUUID } from "node:crypto";
import { and, asc, eq, gt, inArray, lt, lte, or, sql } from "drizzle-orm";
import webpush from "web-push";
import { articles, categories, pushDeliveries, pushJobs, pushRateLimits, pushSubscriptions, type ScriptDb } from "@newspoint/db/node";
import { isAllowedPushEndpoint, makePushPayload, publicPushOrigin, pushFilterMatches, pushRetry, readerNotificationUrl } from "@newspoint/db/push-domain";

const LEASE_MS = 120_000;
const BATCH = 10;
type Delivery = typeof pushDeliveries.$inferSelect;

/** Row lock and INSERT SELECT keep fan-out atomic and independent of browsers. */
export async function expandPushJob(db: ScriptDb): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [job] = await tx.select().from(pushJobs).where(eq(pushJobs.status, "pending"))
      .orderBy(asc(pushJobs.createdAt)).limit(1).for("update", { skipLocked: true });
    if (!job) return false;
    let category: string | null = null;
    let eligible = job.expiresAt.getTime() > Date.now();
    if (job.kind === "article") {
      const [article] = await tx.select({ public: articles.isPublic, publishedAt: articles.publishedAt, slug: categories.slug })
        .from(articles).leftJoin(categories, eq(categories.id, articles.primaryCategoryId)).where(eq(articles.id, job.articleId!));
      eligible &&= Boolean(article?.public && article.publishedAt && article.publishedAt.getTime() <= Date.now());
      category = article?.slug ?? null;
    }
    if (eligible) {
      await tx.execute(sql`
        insert into push_deliveries (job_id, subscription_id)
        select ${job.id}::uuid, s.id from push_subscriptions s
        where s.enabled = true
          and s.created_at <= ${job.createdAt.toISOString()}::timestamptz
          and (${job.kind} = 'test' and s.id = ${job.subscriptionId}::uuid
            or ${job.kind} = 'article' and (
              s.category_slugs is not null and s.category_slugs ? ${category ?? ""}
              or s.category_slugs is null and (s.category_slug is null or s.category_slug = ${category})))
        on conflict (job_id, subscription_id) do nothing`);
    }
    await tx.update(pushJobs).set({ status: eligible ? "expanded" : "skipped" }).where(eq(pushJobs.id, job.id));
    return true;
  });
}

export async function claimPushDeliveries(db: ScriptDb): Promise<Delivery[]> {
  return db.transaction(async (tx) => {
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
  if (!subscription.enabled || job.expiresAt.getTime() <= Date.now() || delivery.attempts > 6
    || !isAllowedPushEndpoint(subscription.endpoint) || !url
    || (job.kind === "article" && (!row.public || !row.publishedAt || row.publishedAt.getTime() > Date.now()
      || !pushFilterMatches(subscription.categorySlugs, subscription.categorySlug, row.slug)))) {
    await finish({ status: "skipped", errorCode: "ineligible" });
    return;
  }
  const payload = makePushPayload(job.kind === "test" ? "NewsPoint — тестово известие" : row.title!,
    job.kind === "test" ? "Известията работят на това устройство. Докоснете, за да отворите NewsPoint." : "Нова публикация в NewsPoint.bg",
    url, `np-${job.kind}-${job.kind === "test" ? job.id : job.articleId}`);
  try {
    await send({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, JSON.stringify(payload),
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
    try {
      const origin = publicPushOrigin(process.env.WEB_URL);
      if (!origin || !process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) throw new Error("Configure WEB_URL and VAPID keys for reader push");
      webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? "mailto:push@newspoint.bg", process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
      // Missing migration must not stop sync/scheduled publication.
      if (Date.now() - lastMaintenance > 60_000) {
        await db.delete(pushJobs).where(lt(pushJobs.expiresAt, new Date(Date.now() - 7 * 86400_000)));
        await db.delete(pushRateLimits).where(lt(pushRateLimits.windowStart, new Date(Date.now() - 3600_000)));
        lastMaintenance = Date.now();
      }
      for (let i = 0; i < 5 && !stopped; i++) if (!(await expandPushJob(db))) break;
      if (!stopped) await Promise.all((await claimPushDeliveries(db)).map((row) => deliverPush(db, row, origin)));
    } catch {
      if (Date.now() - lastWarning > 60_000) {
        log("reader push paused: check migration 27, database, WEB_URL and VAPID configuration (no subscription details logged)");
        lastWarning = Date.now();
      }
    } finally {
      if (!stopped) timer = setTimeout(() => { running = tick(); }, 2000);
    }
  }
  running = tick();
  return async () => { stopped = true; clearTimeout(timer); await running; };
}
