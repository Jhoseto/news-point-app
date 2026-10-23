import { NextResponse, type NextRequest } from "next/server";
import { and, eq, lte, sql } from "drizzle-orm";
import { articleReadCounts, articleViewBoosts, articles, getDb, hasArticleReadCounts, hasArticleViewBoosts } from "@newspoint/db";
import { isArticleReadSameOrigin } from "@/lib/article-read";
import { clearLegacyArticleReadCookies } from "@/lib/article-read-cookie-cleanup";
import { z } from "zod";
import { CONSENT_COOKIE, parseConsent } from "@/lib/cookie-consent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", Vary: "Cookie", "X-Content-Type-Options": "nosniff" };
const buckets = new Map<string, { count: number; expires: number }>();
// Accept the old field while already-cached clients transition to the cookie-free protocol.
const bodySchema = z.object({ revisit: z.boolean().optional() }).strict();

function allowed(key: string) {
  const now = Date.now();
  for (const [stored, value] of buckets) if (value.expires <= now) buckets.delete(stored);
  const entry = buckets.get(key);
  if (entry) { entry.count += 1; return entry.count <= 12; }
  if (buckets.size >= 5_000) return false;
  buckets.set(key, { count: 1, expires: now + 30 * 60_000 });
  return true;
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!isArticleReadSameOrigin({
    origin: request.headers.get("origin"),
    host: request.headers.get("host"),
    forwardedHost: request.headers.get("x-forwarded-host"),
    forwardedProto: request.headers.get("x-forwarded-proto"),
    fetchSite: request.headers.get("sec-fetch-site"),
  })) {
    return NextResponse.json({ error: "Заявката трябва да е от сайта." }, { status: 403, headers });
  }
  const reply = (response: NextResponse) => {
    clearLegacyArticleReadCookies(response, request);
    return response;
  };
  // Check before IP buckets, parsing or database access; the client flag alone is insufficient.
  if (!parseConsent(request.cookies.get(CONSENT_COOKIE)?.value)?.statistics) return reply(new NextResponse(null, { status: 204, headers }));
  const parsed = z.uuid().safeParse((await context.params).id);
  if (!parsed.success) return reply(NextResponse.json({ error: "Невалидна статия." }, { status: 400, headers }));
  const ip = request.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim() || "local";
  if (!allowed(`${ip}:${parsed.data}`)) return reply(NextResponse.json({ error: "Твърде много заявки." }, { status: 429, headers }));
  const payload = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!payload.success) return reply(NextResponse.json({ error: "Невалидна заявка." }, { status: 400, headers }));

  try {
    const db = getDb();
    if (!await hasArticleReadCounts(db)) return reply(NextResponse.json({ available: false }, { status: 503, headers }));
    const [article] = await db.select({ id: articles.id }).from(articles)
      .where(and(eq(articles.id, parsed.data), eq(articles.isPublic, true), lte(articles.publishedAt, new Date()))).limit(1);
    if (!article) return reply(NextResponse.json({ error: "Статията не е намерена." }, { status: 404, headers }));
    const added = await hasArticleViewBoosts(db)
      ? (await db.select({ value: articleViewBoosts.artificialCount }).from(articleViewBoosts).where(eq(articleViewBoosts.articleId, article.id)).limit(1))[0]?.value ?? 0
      : 0;
    // The client session records one open and explicitly allows a later return.
    // A per-article server cookie added no abuse protection because `revisit` is
    // caller-controlled, while its unbounded root-path fan-out broke `/admin/`.
    const [row] = await db.insert(articleReadCounts).values({ articleId: article.id, readCount: 1 })
      .onConflictDoUpdate({
        target: articleReadCounts.articleId,
        set: { readCount: sql`${articleReadCounts.readCount} + 1`, updatedAt: new Date() },
      }).returning({ count: articleReadCounts.readCount });
    return reply(NextResponse.json({ count: (row?.count ?? 0) + added }, { headers }));
  } catch (error) {
    console.error("[article-read] failed", error instanceof Error ? error.message : "unknown");
    return reply(NextResponse.json({ error: "Статистиката временно не е достъпна." }, { status: 503, headers }));
  }
}
