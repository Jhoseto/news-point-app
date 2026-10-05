import "server-only";
import { createHash, ECDH, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";
import { and, eq, gt, sql } from "drizzle-orm";
import { z } from "zod";
import { categories, getDb, pushJobs, pushRateLimits, pushSubscriptions } from "@newspoint/db";
import { isAllowedPushEndpoint, publicPushOrigin, type PushState } from "@newspoint/db/push-domain";
import { readPushConfiguration } from "@newspoint/db/push-configuration";

const schema = z.object({
  action: z.enum(["status", "subscribe", "preferences", "disable", "unsubscribe", "test"]).optional(),
  endpoint: z.string().max(2048).refine(isAllowedPushEndpoint),
  keys: z.object({ p256dh: z.string().regex(/^[A-Za-z0-9_-]{87}=?$/), auth: z.string().regex(/^[A-Za-z0-9_-]{22}(==)?$/) }),
  revision: z.number().int().positive().optional(),
  categorySlugs: z.array(z.string().min(1).max(64)).max(32).nullable().optional(),
  categorySlug: z.string().min(1).max(64).nullable().optional(),
  enabled: z.boolean().optional(), locale: z.string().min(2).max(32).optional(), userAgent: z.string().max(1024).optional(),
});

function response(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "private, no-store", "Vary": "Origin" } });
}
export function pushRequestAllowed(request: Request): boolean {
  try {
    const origin = request.headers.get("origin");
    const requestUrl = new URL(request.url);
    const local = ["localhost", "127.0.0.1"].includes(requestUrl.hostname);
    const expected = local ? requestUrl.origin : publicPushOrigin(process.env.WEB_URL);
    return Boolean(origin && origin === expected && request.headers.get("sec-fetch-site") !== "cross-site"
      && request.headers.get("content-type")?.split(";")[0]?.trim() === "application/json");
  } catch { return false; }
}

export function samePushKeys(a: { p256dh: string; auth: string }, b: { p256dh: string; auth: string }) {
  return ["p256dh", "auth"].every((key) => {
    const left = Buffer.from(a[key as keyof typeof a], "base64url");
    const right = Buffer.from(b[key as keyof typeof b], "base64url");
    return left.length === right.length && timingSafeEqual(left, right);
  });
}

function state(row: typeof pushSubscriptions.$inferSelect): PushState {
  return { enabled: row.enabled, revision: row.revision, categorySlugs: row.categorySlugs ?? (row.categorySlug ? [row.categorySlug] : null) };
}

async function readBody(request: Request) {
  if (Number(request.headers.get("content-length") ?? 0) > 8192) throw new Error("body_limit");
  const reader = request.body?.getReader();
  if (!reader) throw new Error("body_missing");
  const decoder = new TextDecoder();
  let size = 0;
  let text = "";
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > 8192) { await reader.cancel(); throw new Error("body_limit"); }
      text += decoder.decode(chunk.value, { stream: true });
    }
    return JSON.parse(text + decoder.decode()) as unknown;
  } finally { reader.releaseLock(); }
}

async function allowBucket(db: ReturnType<typeof getDb>, key: string, limit: number) {
  const bucket = createHash("sha256").update(key).digest("hex");
  const [row] = await db.insert(pushRateLimits).values({ bucket }).onConflictDoUpdate({ target: pushRateLimits.bucket, set: {
    hits: sql`case when ${pushRateLimits.windowStart} < now() - interval '1 minute' then 1 else ${pushRateLimits.hits} + 1 end`,
    windowStart: sql`case when ${pushRateLimits.windowStart} < now() - interval '1 minute' then now() else ${pushRateLimits.windowStart} end`,
  } }).returning({ hits: pushRateLimits.hits });
  return Boolean(row && row.hits <= limit);
}

export async function handlePushRequest(request: Request) {
  if (!pushRequestAllowed(request)) return response({ error: "origin" }, 403);
  let parsed: z.infer<typeof schema>;
  try {
    const result = schema.safeParse(await readBody(request));
    if (!result.success || Buffer.from(result.data.keys.p256dh, "base64url")[0] !== 4) return response({ error: "invalid" }, 400);
    // Validate the curve point before persisting or invoking push encryption.
    ECDH.convertKey(Buffer.from(result.data.keys.p256dh, "base64url"), "prime256v1");
    parsed = result.data;
  } catch { return response({ error: "invalid" }, 400); }
  const action = parsed.action ?? (parsed.enabled === false ? "disable" : "subscribe");
  const configured = readPushConfiguration() !== null;
  if ((action === "subscribe" || action === "test") && !configured) return response({ error: "config" }, 503);
  try {
    const db = getDb();
    const forwarded = request.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim();
    const client = process.env.PUSH_TRUST_PROXY === "1" && forwarded && isIP(forwarded) ? forwarded : "global";
    if (!(await allowBucket(db, `reader-push-ingress:${client}`, client === "global" ? 3000 : 120))
      || !(await allowBucket(db, `reader-push-device:${parsed.endpoint}`, 60))) {
      return new Response(JSON.stringify({ error: "rate_limit" }), { status: 429,
        headers: { "Content-Type": "application/json", "Cache-Control": "private, no-store", "Retry-After": "60" } });
    }
    const requestedSlugs = parsed.categorySlugs !== undefined ? parsed.categorySlugs
      : parsed.categorySlug !== undefined ? (parsed.categorySlug ? [parsed.categorySlug] : null) : undefined;
    const slugs = requestedSlugs === undefined ? undefined : requestedSlugs === null ? null : [...new Set(requestedSlugs)].sort();
    if (action === "preferences" && slugs === undefined) return response({ error: "rubrics" }, 400);
    if (slugs?.length) {
      const menu = await db.select({ slug: categories.slug }).from(categories).where(eq(categories.inMenu, true));
      const allowed = new Set(menu.map((item) => item.slug));
      if (slugs.some((slug) => !allowed.has(slug))) return response({ error: "rubrics" }, 400);
    }
    return await db.transaction(async (tx) => {
      await tx.execute(sql`set local statement_timeout = '5s'`);
      await tx.execute(sql`set local lock_timeout = '3s'`);
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${parsed.endpoint}, 0))`);
      const [row] = await tx.select().from(pushSubscriptions).where(eq(pushSubscriptions.endpoint, parsed.endpoint));
      if (row && !samePushKeys(row, parsed.keys)) return response({ error: "ownership" }, 403);
      if (action === "status") return response({ state: row ? state(row) : null, configured });
      if (!row && action !== "subscribe") return response({ error: "missing" }, 404);
      // Explicit opt-out wins even if another view just saved preferences.
      if (row && action !== "test" && action !== "disable" && parsed.revision !== row.revision) return response({ error: "conflict", state: state(row) }, 409);
      if (action === "test") {
        if (!row!.enabled) return response({ error: "disabled" }, 409);
        const recent = await tx.select({ id: pushJobs.id }).from(pushJobs).where(and(eq(pushJobs.subscriptionId, row!.id),
          eq(pushJobs.kind, "test"), gt(pushJobs.createdAt, new Date(Date.now() - 60_000)))).limit(1);
        if (recent.length) return response({ error: "test_rate_limit" }, 429);
        await tx.insert(pushJobs).values({ kind: "test", subscriptionId: row!.id, expiresAt: new Date(Date.now() + 5 * 60_000) });
        return response({ state: state(row!), queued: true }, 202);
      }
      if (action === "unsubscribe") {
        await tx.delete(pushSubscriptions).where(eq(pushSubscriptions.id, row!.id));
        return response({ state: null });
      }
      if (!row) {
        const [created] = await tx.insert(pushSubscriptions).values({ endpoint: parsed.endpoint, ...parsed.keys,
          categorySlugs: slugs ?? null, enabled: true, locale: parsed.locale ?? "bg", userAgent: parsed.userAgent ?? "" }).returning();
        return response({ state: state(created!) }, 201);
      }
      const [updated] = await tx.update(pushSubscriptions).set({ revision: row.revision + 1, updatedAt: new Date(),
        ...(action === "subscribe" ? { enabled: true, enabledAt: row.enabled ? row.enabledAt : new Date() }
          : action === "disable" ? { enabled: false, enabledAt: null } : {}),
        ...((action === "subscribe" || action === "preferences") && slugs !== undefined ? { categorySlugs: slugs, categorySlug: null } : {}),
      }).where(eq(pushSubscriptions.id, row.id)).returning();
      return response({ state: state(updated!) });
    });
  } catch { return response({ error: "unavailable" }, 503); }
}
