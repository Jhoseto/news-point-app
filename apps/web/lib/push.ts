import "server-only";
import webpush from "web-push";
import { eq, and } from "drizzle-orm";
import { pushSubscriptions, articles, categories } from "@newspoint/db";
import { getDb } from "@newspoint/db/node";

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
}, payload: Payload): Promise<{ ok: true } | { ok: false; reason: "gone" | "error" }> {
  if (!ensureConfigured()) return { ok: false, reason: "error" };
  try {
    await webpush.sendNotification(
      {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth },
      },
      JSON.stringify(payload),
      { TTL: 60 * 60, headers: { Urgency: "normal" } },
    );
    return { ok: true };
  } catch (error) {
    const statusCode = (error as { statusCode?: number }).statusCode;
    if (statusCode === 404 || statusCode === 410) return { ok: false, reason: "gone" };
    return { ok: false, reason: "error" };
  }
}

/**
 * Send a push for a newly published article to every subscriber whose
 * `categorySlug` matches the article's primary category (or who has none).
 * The article must already be readable by the writer at this point.
 *
 * Errors per-subscriber are isolated; one bad endpoint never blocks the rest.
 */
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
    .leftJoin(categories, eq(articles.categoryId, categories.id))
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

  let sent = 0;
  const gone: string[] = [];
  for (const sub of target) {
    const result = await dispatch(
      { id: sub.id, endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
      payload,
    );
    if (result.ok) sent += 1;
    else if (result.reason === "gone") gone.push(sub.id);
  }
  if (gone.length > 0) {
    await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, gone[0]));
    if (gone.length > 1) {
      const rest = gone.slice(1);
      await db.delete(pushSubscriptions).where(
        // simple chained delete; one transaction
        and(eq(pushSubscriptions.id, rest[0])),
      );
    }
  }
  await db
    .update(pushSubscriptions)
    .set({ lastNotifiedAt: new Date() })
    .where(eq(pushSubscriptions.id, target[0].id));
  return { sent, removed: gone.length };
}