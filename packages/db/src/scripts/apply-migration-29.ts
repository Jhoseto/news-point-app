import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createTransactionClient } from "../connection";
import { describeConnection, findRepoRoot, loadRootEnv, readDatabaseEnv } from "../env";

loadRootEnv();
const { DATABASE_URL } = readDatabaseEnv("dev");
const root = findRepoRoot();
const migrationPath = resolve(root, "packages/db/migrations/29_story_theme_slug_history.sql");

console.log("Target:", describeConnection(DATABASE_URL));
console.log("File:", migrationPath);

const sql = createTransactionClient(DATABASE_URL, 1);
try {
  const existing = await sql<{ table_name: string }[]>`
    select table_name
    from information_schema.tables
    where table_schema = 'public' and table_name = 'story_theme_slugs'
  `;
  if (existing.length) {
    console.log("Already applied: story_theme_slugs exists");
    process.exit(0);
  }

  await sql.unsafe(readFileSync(migrationPath, "utf8"));
  console.log("Applied: 29_story_theme_slug_history.sql");

  const tables = await sql<{ table_name: string }[]>`
    select table_name
    from information_schema.tables
    where table_schema = 'public' and table_name = 'story_theme_slugs'
  `;
  const trigger = await sql<{ tgname: string }[]>`
    select tgname from pg_trigger where tgname = 'story_theme_slug_reservation'
  `;
  const seeded = await sql<{ n: string }[]>`
    select count(*)::text as n from story_theme_slugs
  `;
  console.log("Table:", tables[0]?.table_name ?? "(missing)");
  console.log("Trigger:", trigger[0]?.tgname ?? "(missing)");
  console.log("Seeded rows:", seeded[0]?.n ?? "0");

  process.exit(tables.length === 1 && trigger.length === 1 ? 0 : 1);
} catch (error) {
  console.error("Migration failed:", error instanceof Error ? error.message : error);
  process.exit(2);
} finally {
  await sql.end({ timeout: 5 });
}
