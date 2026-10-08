import { sql } from "drizzle-orm";
import type { ScriptDb } from "./node";

type Executor = Pick<ScriptDb, "execute">;
/** Raw optional columns keep the old database readable until Koce applies migration 30. */
export async function hasRevisionListen(db: Executor): Promise<boolean> {
  const rows = await db.execute<{ ready: boolean }>(sql`select exists(select 1 from information_schema.columns where table_schema='public' and table_name='article_revisions' and column_name='listen_enabled') as ready`);
  return rows[0]?.ready === true;
}
export async function revisionListen(db: Executor, articleId: string, number: number): Promise<boolean | null> {
  if (!await hasRevisionListen(db)) return null;
  const rows = await db.execute<{ enabled: boolean | null }>(sql`select listen_enabled as enabled from article_revisions where article_id=${articleId}::uuid and number=${number}`);
  return rows[0]?.enabled ?? null;
}
export async function writeRevisionListen(db: Executor, articleId: string, number: number, enabled: boolean): Promise<void> {
  await db.execute(sql`update article_revisions set listen_enabled=${enabled} where article_id=${articleId}::uuid and number=${number}`);
}

export async function qaPublicationAllowed(db: Executor, id: string, title: string, slug: string): Promise<boolean> {
  if (!title.startsWith("[QA editor]") && !slug.startsWith("qa-editor-")) return true;
  const ready = await db.execute<{ ready: boolean }>(sql`select to_regclass('public.editor_qa_articles') is not null as ready`);
  if (!ready[0]?.ready) return false;
  const rows = await db.execute<{ run_id: string }>(sql`select run_id from editor_qa_articles where article_id=${id}::uuid`);
  return !!rows[0] && title.startsWith("[QA editor]") && slug.startsWith(`qa-editor-${rows[0].run_id}-`);
}
