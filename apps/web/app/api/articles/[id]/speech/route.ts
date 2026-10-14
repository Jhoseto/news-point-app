import { NextResponse, type NextRequest } from "next/server";
import { and, eq, lte, sql } from "drizzle-orm";
import { articles, getDb } from "@newspoint/db";
import { articleBody } from "@newspoint/content";
import { isArticleReadSameOrigin } from "@/lib/article-read";
import { bulgarianSpeech } from "@/lib/tts/remote-voice";
import { hasCachedSpeech } from "@/lib/tts/speech-cache";
import { articleReadingText } from "@/lib/tts/utterances";
import { z } from "zod";
import { parseSpeechFormat } from "@/lib/tts/speech-format";

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
  const versions = request.nextUrl.searchParams.getAll("v");
  const version = versions.length === 1 && /^\d+$/.test(versions[0]!) ? Number(versions[0]) : NaN;
  if (!Number.isSafeInteger(version) || version < 1) return NextResponse.json({ error: "Невалидна версия." }, { status: 400, headers });
  const format = parseSpeechFormat(request.nextUrl.searchParams.getAll("format"));
  if (!format) return NextResponse.json({ error: "Невалиден аудиоформат." }, { status: 400, headers });

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
    if (version !== row.version) return NextResponse.json({ error: "Статията е обновена. Презаредете я и опитайте отново." }, { status: 409, headers });

    const text = articleReadingText({
      id: row.id,
      title: row.title,
      excerpt: row.excerpt,
      body: articleBody.parse(row.body),
    });
    if (!text) return NextResponse.json({ error: "Статията няма текст за слушане." }, { status: 404, headers });

    const cacheKey = `${row.id}-v${row.version}`;
    const cached = await hasCachedSpeech(cacheKey, format);
    if (!cached) {
      const ip = request.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim() || "local";
      if (!allowGeneration(`${ip}:${row.id}`)) {
        return NextResponse.json({ error: "Твърде много заявки." }, { status: 429, headers });
      }
    }

    const audio = await bulgarianSpeech(cacheKey, text, format);
    if (audio.byteLength === 0) return NextResponse.json({ error: "Статията няма текст за слушане." }, { status: 404, headers });
    // Generation may outlast an editorial update or withdrawal. Validate again
    // before sending bytes; the on-disk cache never bypasses publication checks.
    const [current] = await db.select({ version: articles.version }).from(articles)
      .where(and(eq(articles.id, row.id), eq(articles.isPublic, true), eq(articles.listenEnabled, true), lte(articles.publishedAt, sql`now()`))).limit(1);
    if (!current) return NextResponse.json({ error: "Слушането вече не е достъпно." }, { status: 404, headers });
    if (current.version !== version) return NextResponse.json({ error: "Статията е обновена. Презаредете я и опитайте отново." }, { status: 409, headers });
    return new NextResponse(Buffer.from(audio), {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Length": String(audio.byteLength),
        // Keep generation cached on disk. Browser/CDN caching must wait until
        // publication/visibility changes can reliably purge every public copy.
        "Cache-Control": headers["Cache-Control"],
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("[speech]", error instanceof Error ? error.message : "failed");
    return NextResponse.json({ error: "Четенето не тръгна." }, { status: 502, headers });
  }
}
