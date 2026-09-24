import { sql } from "drizzle-orm";
import type { ScriptDb } from "@newspoint/db/node";

/** Migration 06 adds the outbox; without it live sync cannot record events. */
export async function assertOutboxReady(db: ScriptDb): Promise<void> {
  const rows = await db.execute<{ ready: boolean }>(
    sql`select to_regclass('public.outbox_events') is not null as ready`,
  );
  if (!rows[0]?.ready) {
    throw new Error("outbox_events is missing: apply packages/db/migrations/06_outbox.sql in Supabase first");
  }
}
