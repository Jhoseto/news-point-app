import { NextResponse, type NextRequest } from "next/server";
import { and, eq, lte, sql } from "drizzle-orm";
import { articleReadCounts, articles, getDb, hasArticleReadCounts } from "@newspoint/db";
import { isArticleReadSameOrigin } from "@/lib/article-read";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
const buckets = new Map<string, { count: number; expires: number }>();

function allowed(key: string) {
  const now = Date.now();
  for (const [stored, value] of buckets) if (value.expires <= now) buckets.delete(stored);
  const entry = buckets.get(key);
  if (entry) { entry.count += 1; return entry.count <= 120; }
  if (buckets.size >= 5_000) return false;
  buckets.set(key, { count: 1, expires: now + 10 * 60_000 });
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
  const parsed = z.uuid().safeParse((await context.params).id);
  if (!parsed.success) return NextResponse.json({ error: "Невалидна статия." }, { status: 400, headers });
  const ip = request.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim() || "local";
  if (!allowed(`${ip}:${parsed.data}`)) return NextResponse.json({ error: "Твърде много заявки." }, { status: 429, headers });

  try {
    const db = getDb();
    if (!await hasArticleReadCounts(db)) return NextResponse.json({ available: false }, { status: 503, headers });
    const [article] = await db.select({ id: articles.id }).from(articles)
      .where(and(eq(articles.id, parsed.data), eq(articles.isPublic, true), lte(articles.publishedAt, new Date()))).limit(1);
    if (!article) return NextResponse.json({ error: "Статията не е намерена." }, { status: 404, headers });
    const [row] = await db.insert(articleReadCounts).values({ articleId: article.id, readCount: 1 })
      .onConflictDoUpdate({
        target: articleReadCounts.articleId,
        set: { readCount: sql`${articleReadCounts.readCount} + 1`, updatedAt: new Date() },
      }).returning({ count: articleReadCounts.readCount });
    return NextResponse.json({ count: row?.count ?? 0 }, { headers });
  } catch (error) {
    console.error("[article-read] failed", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "Статистиката временно не е достъпна." }, { status: 503, headers });
  }
}
