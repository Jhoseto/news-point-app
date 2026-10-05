import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createTransactionClient } from "../connection";
import { describeConnection, findRepoRoot, loadRootEnv, readDatabaseEnv } from "../env";

loadRootEnv();
const { DATABASE_URL } = readDatabaseEnv("dev");
const root = findRepoRoot();
const migrationPath = resolve(root, "packages/db/migrations/28_story_themes.sql");

console.log("Target:", describeConnection(DATABASE_URL));
console.log("File:", migrationPath);

const sql = createTransactionClient(DATABASE_URL, 1);
try {
  await sql.unsafe(readFileSync(migrationPath, "utf8"));
  console.log("Applied: 28_story_themes.sql");

  const tables = await sql<{ table_name: string }[]>`
    select table_name
    from information_schema.tables
    where table_schema = 'public'
      and table_name in ('story_themes', 'story_theme_articles')
    order by table_name
  `;
  console.log("Tables:", tables.map((row) => row.table_name).join(", ") || "(none)");

  const constraint = await sql<{ def: string }[]>`
    select pg_get_constraintdef(oid) as def
    from pg_constraint
    where conname = 'outbox_events_type_check'
  `;
  console.log("outbox_events_type_check:", constraint[0]?.def ?? "(missing)");

  process.exit(tables.length === 2 ? 0 : 1);
} catch (error) {
  console.error("Migration failed:", error instanceof Error ? error.message : error);
  process.exit(2);
} finally {
  await sql.end({ timeout: 5 });
}
