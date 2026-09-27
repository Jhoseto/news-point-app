import { sql } from "drizzle-orm";
import type { ScriptDb } from "./node";

// Schema readiness only, never article/private data. One check per DB instance
// per minute, coalesced across concurrent homepage queries during SQL rollout.
const readiness = new WeakMap<object, { until: number; pending: Promise<boolean> }>();
export function hasMediaPresentations(db: Pick<ScriptDb, "execute">): Promise<boolean> {
  const current = readiness.get(db);
  if (current && current.until > Date.now()) return current.pending;
  const pending = db.execute<{ available: boolean }>(sql`select to_regclass('public.media_presentations') is not null as available`)
    .then(rows => rows[0]?.available === true);
  readiness.set(db, { until: Date.now() + 60_000, pending });
  pending.catch(() => readiness.delete(db));
  return pending;
}
