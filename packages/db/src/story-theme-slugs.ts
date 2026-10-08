import "server-only";
import { sql } from "drizzle-orm";
import { getDb } from "./index";

/** Missing migration is distinct from an empty history; DB connection errors still surface. */
export async function hasStoryThemeSlugHistory(db = getDb()): Promise<boolean> {
  const result = await db.execute<{ ready: boolean }>(sql`select to_regclass('public.story_theme_slugs') is not null as ready`);
  // postgres-js returns an array; isolated PGlite audits expose { rows }.
  const rows = Array.isArray(result) ? result : (result as unknown as { rows: { ready: boolean }[] }).rows;
  return rows[0]?.ready === true;
}
