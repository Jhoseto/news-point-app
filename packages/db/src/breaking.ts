import { and, desc, eq, lte, sql } from "drizzle-orm";
import { breakingInputSchema, type BreakingInput, type BreakingSettings, type PublicBreaking } from "@newspoint/content";
import type { ScriptDb } from "./node";
import { articles, breakingBulletins, outboxEvents } from "./schema";

type Reader = Pick<ScriptDb, "execute" | "select">;
export async function breakingReady(db: Reader): Promise<boolean> {
  const rows = await db.execute<{ ready: boolean }>(sql`select to_regclass('public.breaking_bulletins') is not null as ready`);
  return rows[0]?.ready === true;
}

export async function readBreakingSettings(db: Reader): Promise<BreakingSettings> {
  const empty: BreakingSettings = { ready: false, version: 0, enabled: false, text: "", articleId: null, articleTitle: null };
  if (!await breakingReady(db)) return empty;
  const [row] = await db.select({ version: breakingBulletins.id, enabled: breakingBulletins.enabled, text: breakingBulletins.text,
    articleId: breakingBulletins.articleId, articleTitle: articles.title })
    .from(breakingBulletins).leftJoin(articles, eq(articles.id, breakingBulletins.articleId)).orderBy(desc(breakingBulletins.id)).limit(1);
  return row ? { ready: true, ...row } : { ...empty, ready: true };
}

export async function readPublicBreaking(db: Reader): Promise<PublicBreaking | null> {
  if (!await breakingReady(db)) return null;
  const [row] = await db.select({ version: breakingBulletins.id, enabled: breakingBulletins.enabled, text: breakingBulletins.text, path: articles.path })
    .from(breakingBulletins).leftJoin(articles, and(eq(articles.id, breakingBulletins.articleId), eq(articles.isPublic, true), lte(articles.publishedAt, sql`now()`)))
    .orderBy(desc(breakingBulletins.id)).limit(1);
  return row?.enabled && row.text ? { version: row.version, text: row.text, path: row.path } : null;
}

export class BreakingWriteError extends Error {
  constructor(public status: 422 | 409, public code: string, message: string) { super(message); }
}

export async function writeBreaking(db: ScriptDb, raw: BreakingInput, actorId: string) {
  const input = breakingInputSchema.parse(raw);
  if (!await breakingReady(db)) throw new BreakingWriteError(422, "not_ready", "Приложете миграция 40_breaking_bulletins.sql и презаредете.");
  return db.transaction(async tx => {
    // Serialize the first insert too; the latest state is an immutable version.
    await tx.execute(sql`select pg_advisory_xact_lock(71040, 1)`);
    const before = await readBreakingSettings(tx);
    if (before.version !== input.expectedVersion) throw new BreakingWriteError(409, "breaking_conflict", "Лентата е променена от друг редактор. Презаредете настройките.");
    if (input.articleId) {
      const [article] = await tx.select({ id: articles.id }).from(articles).where(and(eq(articles.id, input.articleId), eq(articles.isPublic, true), lte(articles.publishedAt, sql`now()`))).limit(1);
      if (!article) throw new BreakingWriteError(422, "invalid_article", "Изберете публикувана статия или премахнете връзката.");
    }
    await tx.insert(breakingBulletins).values({ enabled: input.enabled, text: input.text, articleId: input.articleId, actorId });
    await tx.insert(outboxEvents).values({ type: "breaking.updated", entityId: null, version: 1, payload: { path: "/", title: "", topics: [] } });
    return { before, after: await readBreakingSettings(tx) };
  });
}
