import { access } from "node:fs/promises";
import { NextResponse, type NextRequest } from "next/server";
import { and, eq, lte, sql } from "drizzle-orm";
import { articles, getDb } from "@newspoint/db";
import { articleBody } from "@newspoint/content";
import { isArticleReadSameOrigin } from "@/lib/article-read";
import { bulgarianSpeech, speechCachePath } from "@/lib/tts/remote-voice";
import { articleReadingText } from "@/lib/tts/utterances";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
const generations = new Map<string, { count: number; expires: number }>();

function allowGeneration(key: string): boolean {
  const now = Date.now();
  for (const [stored, value] of generations) if (value.expires <= now) generations.delete(stored);
  const entry = generations.get(key);
  if (entry) {
    entry.count += 1;
    return entry.count <= 8;
  }
  if (generations.size >= 2_000) return false;
  generations.set(key, { count: 1, expires: now + 10 * 60_000 });
  return true;
}

function fromThisSite(request: NextRequest): boolean {
  const site = request.headers.get("sec-fetch-site");
  if (site === "cross-site") return false;
  if (site === "same-origin" || site === "same-site") return true;
  return isArticleReadSameOrigin({
    origin: request.headers.get("origin"),
    host: request.headers.get("host"),
    forwardedHost: request.headers.get("x-forwarded-host"),
    forwardedProto: request.headers.get("x-forwarded-proto"),
    fetchSite: site,
  });
}

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!fromThisSite(request)) {
    return NextResponse.json({ error: "Заявката трябва да е от сайта." }, { status: 403, headers });
  }
  const parsed = z.uuid().safeParse((await context.params).id);
  if (!parsed.success) return NextResponse.json({ error: "Невалидна статия." }, { status: 400, headers });

  try {
    const db = getDb();
    const [row] = await db
      .select({
        id: articles.id,
        title: articles.title,
        excerpt: articles.excerpt,
        body: articles.body,
        version: articles.version,
        listenEnabled: articles.listenEnabled,
      })
      .from(articles)
      .where(and(eq(articles.id, parsed.data), eq(articles.isPublic, true), lte(articles.publishedAt, sql`now()`)))
      .limit(1);
    if (!row) return NextResponse.json({ error: "Статията не е намерена." }, { status: 404, headers });
    if (!row.listenEnabled) return NextResponse.json({ error: "Слушането на тази статия е изключено." }, { status: 404, headers });

    const text = articleReadingText({
      id: row.id,
      title: row.title,
      excerpt: row.excerpt,
      body: articleBody.parse(row.body),
    });
    if (!text) return NextResponse.json({ error: "Статията няма текст за слушане." }, { status: 404, headers });

    const cacheKey = `${row.id}-v${row.version}`;
    let cached = false;
    try {
      await access(speechCachePath(cacheKey));
      cached = true;
    } catch {
      cached = false;
    }
    if (!cached) {
      const ip = request.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim() || "local";
      if (!allowGeneration(`${ip}:${row.id}`)) {
        return NextResponse.json({ error: "Твърде много заявки." }, { status: 429, headers });
      }
    }

    const audio = await bulgarianSpeech(cacheKey, text);
    if (audio.byteLength === 0) return NextResponse.json({ error: "Статията няма текст за слушане." }, { status: 404, headers });
    return new NextResponse(Buffer.from(audio), {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Length": String(audio.byteLength),
        "Cache-Control": "private, max-age=3600",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("[speech]", error instanceof Error ? error.message : "failed");
    return NextResponse.json({ error: "Четенето не тръгна." }, { status: 502, headers });
  }
}
