import { NextResponse, type NextRequest } from "next/server";
import { and, eq, lte, sql } from "drizzle-orm";
import { articleReadCounts, articleViewBoosts, articles, getDb, hasArticleReadCounts, hasArticleViewBoosts } from "@newspoint/db";
import { isArticleReadSameOrigin } from "@/lib/article-read";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
const buckets = new Map<string, { count: number; expires: number }>();
const bodySchema = z.object({ revisit: z.boolean().optional() });
const READ_COOKIE_PREFIX = "np_rd_";

function allowed(key: string) {
  const now = Date.now();
  for (const [stored, value] of buckets) if (value.expires <= now) buckets.delete(stored);
  const entry = buckets.get(key);
  if (entry) { entry.count += 1; return entry.count <= 12; }
  if (buckets.size >= 5_000) return false;
  buckets.set(key, { count: 1, expires: now + 30 * 60_000 });
  return true;
}

function readCookieName(articleId: string) {
  return `${READ_COOKIE_PREFIX}${articleId}`;
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
  const parsed = z.uuid().safeParse((await context.params).id);
  if (!parsed.success) return NextResponse.json({ error: "Невалидна статия." }, { status: 400, headers });
  const ip = request.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim() || "local";
  if (!allowed(`${ip}:${parsed.data}`)) return NextResponse.json({ error: "Твърде много заявки." }, { status: 429, headers });
  const payload = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!payload.success) return NextResponse.json({ error: "Невалидна заявка." }, { status: 400, headers });
  const revisit = payload.data.revisit === true;
  const cookieName = readCookieName(parsed.data);
  const alreadyCounted = request.cookies.get(cookieName)?.value === "1";

  try {
    const db = getDb();
    if (!await hasArticleReadCounts(db)) return NextResponse.json({ available: false }, { status: 503, headers });
    const [article] = await db.select({ id: articles.id }).from(articles)
      .where(and(eq(articles.id, parsed.data), eq(articles.isPublic, true), lte(articles.publishedAt, new Date()))).limit(1);
    if (!article) return NextResponse.json({ error: "Статията не е намерена." }, { status: 404, headers });
    const added = await hasArticleViewBoosts(db)
      ? (await db.select({ value: articleViewBoosts.artificialCount }).from(articleViewBoosts).where(eq(articleViewBoosts.articleId, article.id)).limit(1))[0]?.value ?? 0
      : 0;
    if (alreadyCounted && !revisit) {
      const [existing] = await db.select({ count: articleReadCounts.readCount }).from(articleReadCounts)
        .where(eq(articleReadCounts.articleId, article.id)).limit(1);
      return NextResponse.json({ count: (existing?.count ?? 0) + added }, { headers });
    }
    const [row] = await db.insert(articleReadCounts).values({ articleId: article.id, readCount: 1 })
      .onConflictDoUpdate({
        target: articleReadCounts.articleId,
        set: { readCount: sql`${articleReadCounts.readCount} + 1`, updatedAt: new Date() },
      }).returning({ count: articleReadCounts.readCount });
    const response = NextResponse.json({ count: (row?.count ?? 0) + added }, { headers });
    response.cookies.set(cookieName, "1", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 });
    return response;
  } catch (error) {
    console.error("[article-read] failed", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "Статистиката временно не е достъпна." }, { status: 503, headers });
  }
}
