import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createTransactionClient } from "../connection";
import { describeConnection, findRepoRoot, loadRootEnv, readDatabaseEnv } from "../env";

loadRootEnv();
const { DATABASE_URL } = readDatabaseEnv("dev");
const target = new URL(DATABASE_URL);
if (target.hostname !== "127.0.0.1" || target.port !== "5433" || target.pathname !== "/np2_newspoint2") {
  throw new Error(`Refusing unexpected database target: ${describeConnection(DATABASE_URL)}`);
}
const path = resolve(findRepoRoot(), "packages/db/migrations/41_city_guide_sources.sql");
const sql = createTransactionClient(DATABASE_URL, 1);

try {
  const [before] = await sql<{ db: string; existing: string[] }[]>`
    select current_database() as db,
      array(select tablename from pg_tables where schemaname='public' and tablename in
        ('city_sources','city_source_checks','city_records','city_record_versions') order by tablename) as existing
  `;
  if (before?.db !== "np2_newspoint2") throw new Error("Connected to an unexpected database");
  if (before.existing.length === 4) {
    console.log("Migration 41 tables already exist; no SQL applied.");
  } else if (before.existing.length > 0) {
    throw new Error(`Partial city schema exists: ${before.existing.join(", ")}`);
  } else {
    await sql.unsafe(readFileSync(path, "utf8"));
    console.log("Applied 41_city_guide_sources.sql to", describeConnection(DATABASE_URL));
  }
  const [after] = await sql<{ tables: number; visible: number; rls: number }[]>`
    select
      (select count(*)::int from pg_tables where schemaname='public' and tablename in
        ('city_sources','city_source_checks','city_records','city_record_versions')) as tables,
      (select count(*)::int from public.city_sources where publication_state='visible') as visible,
      (select count(*)::int from pg_class where relname in
        ('city_sources','city_source_checks','city_records','city_record_versions') and relrowsecurity) as rls
  `;
  if (after?.tables !== 4 || after.visible !== 0 || after.rls !== 4) throw new Error(`Migration verification failed: ${JSON.stringify(after)}`);
  console.log("Verified four RLS tables; zero visible city sources.");
} finally {
  await sql.end({ timeout: 5 });
}
