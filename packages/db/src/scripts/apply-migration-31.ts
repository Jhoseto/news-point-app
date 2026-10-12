import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createTransactionClient } from "../connection";
import { describeConnection, findRepoRoot, loadRootEnv, readDatabaseEnv } from "../env";

loadRootEnv();
const { DATABASE_URL } = readDatabaseEnv("dev");
const root = findRepoRoot();
const migrationPath = resolve(root, "packages/db/migrations/31_studio_audit_logs.sql");

console.log("Target:", describeConnection(DATABASE_URL));
console.log("File:", migrationPath);

const sql = createTransactionClient(DATABASE_URL, 1);
try {
  const existing = await sql<{ table_name: string }[]>`
    select table_name
    from information_schema.tables
    where table_schema = 'public' and table_name = 'studio_audit_logs'
  `;
  if (existing.length) {
    console.log("Already applied: studio_audit_logs exists");
    process.exit(0);
  }

  await sql.unsafe(readFileSync(migrationPath, "utf8"));
  console.log("Applied: 31_studio_audit_logs.sql");

  const tables = await sql<{ table_name: string }[]>`
    select table_name
    from information_schema.tables
    where table_schema = 'public' and table_name = 'studio_audit_logs'
  `;
  const trigger = await sql<{ tgname: string }[]>`
    select tgname from pg_trigger where tgname = 'studio_audit_immutable'
  `;
  const fn = await sql<{ proname: string }[]>`
    select p.proname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'protect_studio_audit_log'
  `;
  const ext = await sql<{ extname: string }[]>`
    select extname from pg_extension where extname = 'pg_trgm'
  `;
  console.log("Table:", tables[0]?.table_name ?? "(missing)");
  console.log("Trigger:", trigger[0]?.tgname ?? "(missing)");
  console.log("Function:", fn[0]?.proname ?? "(missing)");
  console.log("Extension:", ext[0]?.extname ?? "(missing)");

  process.exit(tables.length === 1 && trigger.length === 1 && fn.length === 1 && ext.length === 1 ? 0 : 1);
} catch (error) {
  console.error("Migration failed:", error instanceof Error ? error.message : error);
  process.exit(2);
} finally {
  await sql.end({ timeout: 5 });
}
