import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createTransactionClient } from "../connection";
import { findRepoRoot, loadRootEnv, readDatabaseEnv } from "../env";

loadRootEnv();
const { DATABASE_URL } = readDatabaseEnv("dev");
const root = findRepoRoot();
const paths = ["25_push_subscriptions.sql", "26_push_category_slugs.sql"].map((name) =>
  resolve(root, "packages/db/migrations", name),
);

const sql = createTransactionClient(DATABASE_URL, 1);
try {
  for (const migrationPath of paths) {
    await sql.unsafe(readFileSync(migrationPath, "utf8"));
    console.log("Applied:", migrationPath.split(/[/\\]/).pop());
  }
  const rows = await sql<{ column_name: string }[]>`
    select column_name
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'push_subscriptions'
      and column_name = 'category_slugs'
  `;
  console.log(rows.length ? "OK: category_slugs exists" : "FAIL: column missing after migration");
  process.exit(rows.length ? 0 : 1);
} catch (error) {
  console.error("Migration failed:", error instanceof Error ? error.message : error);
  process.exit(2);
} finally {
  await sql.end({ timeout: 5 });
}
