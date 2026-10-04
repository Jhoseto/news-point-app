import "server-only";
import webpush from "web-push";
import { eq, inArray } from "drizzle-orm";
import { pushSubscriptions, articles, categories, getDb } from "@newspoint/db";

/**
 * Web Push sender for the reader PWA.
 *
 * One server-side singleton that lazy-configures web-push with the VAPID
 * pair from env. Each `dispatch()` call sends to a single subscription;
 * `notifyArticlePublished()` walks the matching subscriptions and removes
 * any that have expired (404/410) without surfacing the failure.
 */

const SUBJECT = process.env.VAPID_SUBJECT ?? "mailto:push@newspoint.bg";

let configured = false;
function ensureConfigured() {
  if (configured) return true;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return false;
  webpush.setVapidDetails(SUBJECT, publicKey, privateKey);
  configured = true;
  return true;
}

export function isPushConfigured() {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

type Payload = {
  title: string;
  body: string;
  url: string;
  tag?: string;
};

export async function dispatch(sub: {
  endpoint: string;
  p256dh: string;
  auth: string;
  id: string;
}, payload: Payload): Promise<{ ok: true; id: string } | { ok: false; id: string; reason: "gone" | "error" }> {
  if (!ensureConfigured()) return { ok: false, id: sub.id, reason: "error" };
  let lastStatus: number | undefined;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        JSON.stringify(payload),
        { TTL: 60 * 60, headers: { Urgency: "normal" } },
      );
      return { ok: true, id: sub.id };
    } catch (error) {
      const statusCode = (error as { statusCode?: number }).statusCode;
      lastStatus = statusCode;
      // 404/410: subscription is permanently gone — no retry.
      if (statusCode === 404 || statusCode === 410) return { ok: false, id: sub.id, reason: "gone" };
      // 429 (rate limit) or 5xx: linear backoff, then give up.
      if ((statusCode === 429 || (statusCode && statusCode >= 500)) && attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 250));
        continue;
      }
      return { ok: false, id: sub.id, reason: "error" };
    }
  }
  void lastStatus; // mark used
  return { ok: false, id: sub.id, reason: "error" };
}

/**
 * Send a push for a newly published article to every subscriber whose
 * `categorySlug` matches the article's primary category (or who has none).
 * The article must already be readable by the writer at this point.
 *
 * Errors per-subscriber are isolated; one bad endpoint never blocks the rest.
 * Sends are issued in parallel with a concurrency cap so we don't hammer
 * the push service with thousands of in-flight requests at once.
 */
const PUSH_CONCURRENCY = 50;

async function runWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const worker = async () => {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await fn(items[index]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

export async function notifyArticlePublished(articleId: string): Promise<{ sent: number; removed: number }> {
  if (!ensureConfigured()) return { sent: 0, removed: 0 };
  const db = getDb();
  const rows = await db
    .select({
      id: pushSubscriptions.id,
      endpoint: pushSubscriptions.endpoint,
      p256dh: pushSubscriptions.p256dh,
      auth: pushSubscriptions.auth,
      locale: pushSubscriptions.locale,
      categorySlug: pushSubscriptions.categorySlug,
    })
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.enabled, true));
  if (rows.length === 0) return { sent: 0, removed: 0 };

  const articleRows = await db
    .select({
      title: articles.title,
      path: articles.path,
      categorySlug: categories.slug,
    })
    .from(articles)
    .leftJoin(categories, eq(articles.primaryCategoryId, categories.id))
    .where(eq(articles.id, articleId))
    .limit(1);
  const article = articleRows[0];
  if (!article) return { sent: 0, removed: 0 };

  const target = rows.filter(
    (row) => row.categorySlug === null || row.categorySlug === article.categorySlug,
  );
  if (target.length === 0) return { sent: 0, removed: 0 };

  const origin = process.env.WEB_URL ?? "https://newspoint.bg";
  const url = `${origin}${article.path}`;
  const payload: Payload = {
    title: article.title,
    body: "Нова публикация в NewsPoint.bg",
    url,
    tag: article.path,
  };

  const results = await runWithConcurrency(target, PUSH_CONCURRENCY, (sub) =>
    dispatch({ id: sub.id, endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth }, payload),
  );

  let sent = 0;
  const gone: string[] = [];
  for (const result of results) {
    if (result.ok) sent += 1;
    else if (result.reason === "gone") gone.push(result.id);
  }
  if (gone.length > 0) {
    await db.delete(pushSubscriptions).where(inArray(pushSubscriptions.id, gone));
  }
  if (target.length > 0) {
    await db
      .update(pushSubscriptions)
      .set({ lastNotifiedAt: new Date() })
      .where(inArray(pushSubscriptions.id, target.map((row) => row.id)));
  }
  return { sent, removed: gone.length };
}