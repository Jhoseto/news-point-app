import "server-only";
import { readPushConfiguration } from "@newspoint/db/push-configuration";
import { getDb } from "@newspoint/db";
import { sql } from "drizzle-orm";

/** Sends belong exclusively to the durable worker; SSE must never send push. */
export function isPushConfigured() {
  return readPushConfiguration() !== null;
}

export async function hasPushSchema() {
  try {
    const result = await getDb().select({ ready: sql<boolean>`
      to_regclass('public.push_jobs') is not null
      and to_regclass('public.push_deliveries') is not null
      and to_regclass('public.push_rate_limits') is not null
      and (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'push_subscriptions' and column_name in ('enabled_at', 'category_slugs', 'revision')) = 3
      and exists (select 1 from pg_trigger where tgname = 'outbox_reader_push' and tgrelid = to_regclass('public.outbox_events') and tgenabled <> 'D')` }).from(sql`(select 1) readiness`);
    return result[0]?.ready === true;
  } catch { return false; }
}
