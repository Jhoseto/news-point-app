import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createTransactionClient } from "../connection";
import { describeConnection, findRepoRoot, loadRootEnv, readDatabaseEnv } from "../env";

loadRootEnv();
const { DATABASE_URL } = readDatabaseEnv("dev");
const root = findRepoRoot();
const migrationPath = resolve(root, "packages/db/migrations/40_breaking_bulletins.sql");

console.log("Target:", describeConnection(DATABASE_URL));
console.log("File:", migrationPath);

const sql = createTransactionClient(DATABASE_URL, 1);
try {
  const [row] = await sql<{ reg: string | null }[]>`
    select to_regclass('public.breaking_bulletins')::text as reg
  `;
  if (row?.reg === "breaking_bulletins") {
    console.log("Already applied: breaking_bulletins exists");
    process.exit(0);
  }

  await sql.unsafe(readFileSync(migrationPath, "utf8"));
  console.log("Applied: 40_breaking_bulletins.sql");

  const [after] = await sql<{ table: string | null; breakingType: boolean }[]>`
    select
      to_regclass('public.breaking_bulletins')::text as "table",
      exists(
        select 1
        from pg_constraint c
        join pg_class t on t.oid = c.conrelid
        join pg_namespace n on n.oid = t.relnamespace
        where n.nspname = 'public'
          and t.relname = 'outbox_events'
          and c.conname = 'outbox_events_type_check'
          and pg_get_constraintdef(c.oid) like '%breaking.updated%'
      ) as "breakingType"
  `;
  const ok = after?.table === "breaking_bulletins" && after?.breakingType === true;
  console.log("Verify:", after);
  process.exit(ok ? 0 : 1);
} catch (error) {
  console.error("Migration failed:", error instanceof Error ? error.message : error);
  process.exit(2);
} finally {
  await sql.end({ timeout: 5 });
}
