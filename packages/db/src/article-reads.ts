import { sql } from "drizzle-orm";
import type { ScriptDb } from "./node";

const readiness = new WeakMap<object, { until: number; pending: Promise<boolean> }>();

/** Schema capability check so the public site remains usable before migration 17 is applied. */
export function hasArticleReadCounts(db: Pick<ScriptDb, "execute">): Promise<boolean> {
  const current = readiness.get(db);
  if (current && current.until > Date.now()) return current.pending;
  const pending = db.execute<{ ready: boolean }>(sql`select to_regclass('public.article_read_counts') is not null as ready`)
    .then((rows) => rows[0]?.ready === true)
    .catch(() => false);
  readiness.set(db, { until: Date.now() + 60_000, pending });
  pending.catch(() => readiness.delete(db));
  return pending;
}
