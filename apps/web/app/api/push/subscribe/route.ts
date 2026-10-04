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
  locale: z.string().min(2).max(8).optional(),
  userAgent: z.string().max(512).optional(),
});

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
  const { endpoint, keys, categorySlug, locale, userAgent } = parsed.data;
  const ua = userAgent ?? request.headers.get("user-agent") ?? "";
  const db = getDb();

  const existing = await db
    .select({ id: pushSubscriptions.id })
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.endpoint, endpoint))
    .limit(1);
  if (existing[0]) {
    await db
      .update(pushSubscriptions)
      .set({
        p256dh: keys.p256dh,
        auth: keys.auth,
        categorySlug: categorySlug ?? null,
        locale: locale ?? "bg",
        userAgent: ua,
        enabled: true,
        updatedAt: new Date(),
      })
      .where(eq(pushSubscriptions.endpoint, endpoint));
    return NextResponse.json({ ok: true, action: "updated" });
  }
  await db.insert(pushSubscriptions).values({
    endpoint,
    p256dh: keys.p256dh,
    auth: keys.auth,
    categorySlug: categorySlug ?? null,
    locale: locale ?? "bg",
    userAgent: ua,
    enabled: true,
  });
  return NextResponse.json({ ok: true, action: "created" }, { status: 201 });
}

export async function DELETE(request: Request) {
  const url = new URL(request.url);
  const endpoint = url.searchParams.get("endpoint");
  if (!endpoint) return NextResponse.json({ error: "Missing endpoint" }, { status: 400 });
  const db = getDb();
  const deleted = await db
    .delete(pushSubscriptions)
    .where(eq(pushSubscriptions.endpoint, endpoint))
    .returning({ id: pushSubscriptions.id });
  return NextResponse.json({ ok: true, removed: deleted.length });
}