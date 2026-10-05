import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { pushSubscriptions, getDb } from "@newspoint/db";

/**
 * Web Push subscription store.
 *
 * POST: upsert the subscription. The browser sends its `endpoint` + VAPID
 *   `keys`; we additionally accept an optional `categorySlug` for the
 *   "follow Пловдив" flow. Same endpoint → enable if previously disabled.
 * DELETE: remove a subscription by endpoint.
 *
 * No auth: push subscriptions are first-party only, scoped to a single
 * reader device. Rate limiting is handled by the upstream ingress.
 */

const SubscriptionSchema = z.object({
  endpoint: z.string().url().max(2048),
  keys: z.object({
    p256dh: z.string().min(20).max(512),
    auth: z.string().min(10).max(64),
  }),
  categorySlug: z.string().min(1).max(64).nullable().optional(),
  categorySlugs: z.array(z.string().min(1).max(64)).max(32).nullable().optional(),
  enabled: z.boolean().optional(),
  locale: z.string().min(2).max(8).optional(),
  userAgent: z.string().max(1024).optional(),
});

/**
 * Push service endpoints come from a small allow-list (FCM, Mozilla, Apple).
 * Anything else is suspicious — an attacker could push us to POST against
 * an internal address or a third-party endpoint that records the payload.
 */
const ALLOWED_PUSH_ORIGINS = new Set([
  "https://fcm.googleapis.com",
  "https://updates.push.services.mozilla.com",
  "https://updates-autopush.stage.mozaws.net",
  "https://api.push.apple.com",
  "https://web.push.apple.com",
]);

function isAllowedPushEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    if (url.protocol !== "https:") return false;
    return ALLOWED_PUSH_ORIGINS.has(url.origin);
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = SubscriptionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid subscription", details: parsed.error.flatten() }, { status: 400 });
  }
  const { endpoint, keys, categorySlug, categorySlugs, enabled, locale, userAgent } = parsed.data;
  if (!isAllowedPushEndpoint(endpoint)) {
    return NextResponse.json({ error: "Unsupported push endpoint" }, { status: 400 });
  }
  const ua = userAgent ?? request.headers.get("user-agent") ?? "";
  const db = getDb();
  const slugFilter =
    categorySlugs !== undefined
      ? categorySlugs && categorySlugs.length > 0
        ? categorySlugs
        : null
      : undefined;
  const legacySlug = categorySlug !== undefined ? categorySlug ?? null : undefined;

  // Upsert on the unique endpoint constraint. Avoids the SELECT-then-INSERT
  // race that duplicated the row when two requests came in simultaneously.
  const inserted = await db
    .insert(pushSubscriptions)
    .values({
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      categorySlug: legacySlug ?? null,
      categorySlugs: slugFilter ?? null,
      locale: locale ?? "bg",
      userAgent: ua,
      enabled: enabled ?? true,
    })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: {
        p256dh: keys.p256dh,
        auth: keys.auth,
        ...(legacySlug !== undefined ? { categorySlug: legacySlug } : {}),
        ...(slugFilter !== undefined ? { categorySlugs: slugFilter } : {}),
        locale: locale ?? "bg",
        userAgent: ua,
        ...(enabled !== undefined ? { enabled } : { enabled: true }),
        updatedAt: new Date(),
      },
    })
    .returning({ id: pushSubscriptions.id, createdAt: pushSubscriptions.createdAt });
  const row = inserted[0];
  return NextResponse.json(
    { ok: true, action: row ? "updated-or-created" : "noop" },
    { status: 201 },
  );
}

export async function DELETE(request: Request) {
  const url = new URL(request.url);
  const endpoint = url.searchParams.get("endpoint");
  if (!endpoint) return NextResponse.json({ error: "Missing endpoint" }, { status: 400 });
  if (!isAllowedPushEndpoint(endpoint)) {
    return NextResponse.json({ error: "Unsupported push endpoint" }, { status: 400 });
  }
  const db = getDb();
  const deleted = await db
    .delete(pushSubscriptions)
    .where(eq(pushSubscriptions.endpoint, endpoint))
    .returning({ id: pushSubscriptions.id });
  return NextResponse.json({ ok: true, removed: deleted.length });
}