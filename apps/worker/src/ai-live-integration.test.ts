import { expect, it } from "vitest";
import { and, desc, eq, sql } from "drizzle-orm";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { articleText } from "@newspoint/content";
import { articles, createScriptDb, loadRootEnv } from "@newspoint/db/node";
import { factPack, synthesize } from "./ai-gemini";

it.skipIf(process.env.AI_STUDIO_SMOKE !== "1")("extracts verifiable facts from a real published article with Gemini", async () => {
  loadRootEnv();
  const { db, close } = createScriptDb("dev");
  try {
    const [row] = await db.select().from(articles).where(and(eq(articles.isPublic, true), sql`${articles.publishedAt} is not null`, sql`length(${articles.body}::text) between 500 and 2500`)).orderBy(desc(articles.publishedAt)).limit(1);
    if (!row?.publishedAt) throw new Error("No suitable published article found");
    const source = { id: row.id, title: row.title, path: row.path, excerpt: row.excerpt, text: articleText(row.body), version: row.version, publishedRevision: row.publishedRevision, publishedAt: row.publishedAt.toISOString() };
    expect(source.text.length).toBeGreaterThan(80);
    const result = await factPack(source);
    expect(result.value.facts.length).toBeGreaterThan(0);
    expect(result.value.quotes.every((quote) => source.text.includes(quote))).toBe(true);
  } finally { await close(); }
}, 60_000);

it.skipIf(process.env.AI_STUDIO_VOICE_PREVIEW !== "1")("renders a short Bulgarian Alex and Maya voice preview", async () => {
  loadRootEnv();
  const result = await synthesize([
    { speaker: "alex", text: "Здравейте, вие слушате подкаста на NewsPoint.", direction: "спокоен новинарски тон" },
    { speaker: "maya", text: "След малко започва обзорът на най-важните теми от деня.", direction: "топъл, естествен тон" },
  ], { alex: "Puck", maya: "Kore" });
  expect(result.bytes.toString("ascii", 0, 4)).toBe("RIFF");
  const dir = resolve(process.cwd(), "tests/reports/ai-studio");
  await mkdir(dir, { recursive: true });
  await writeFile(resolve(dir, "puck-kore-preview.wav"), result.bytes);
}, 90_000);
