import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createTransactionClient } from "../connection";
import { describeConnection, findRepoRoot, loadRootEnv, readDatabaseEnv } from "../env";

loadRootEnv();
const { DATABASE_URL } = readDatabaseEnv("dev");
const root = findRepoRoot();
const migrationPath = resolve(root, "packages/db/migrations/30_editor_revisions.sql");

console.log("Target:", describeConnection(DATABASE_URL));
console.log("File:", migrationPath);

const sql = createTransactionClient(DATABASE_URL, 1);
try {
  const existing = await sql<{ table_name: string }[]>`
    select table_name
    from information_schema.tables
    where table_schema = 'public' and table_name = 'editor_qa_articles'
  `;
  const column = await sql<{ column_name: string }[]>`
    select column_name
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'article_revisions'
      and column_name = 'listen_enabled'
  `;
  if (existing.length && column.length) {
    console.log("Already applied: editor_qa_articles + article_revisions.listen_enabled");
    process.exit(0);
  }

  await sql.unsafe(readFileSync(migrationPath, "utf8"));
  console.log("Applied: 30_editor_revisions.sql");

  const tables = await sql<{ table_name: string }[]>`
    select table_name
    from information_schema.tables
    where table_schema = 'public' and table_name = 'editor_qa_articles'
  `;
  const listenCol = await sql<{ column_name: string }[]>`
    select column_name
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'article_revisions'
      and column_name = 'listen_enabled'
  `;
  const fn = await sql<{ proname: string }[]>`
    select p.proname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'enqueue_reader_push'
  `;
  console.log("Table:", tables[0]?.table_name ?? "(missing)");
  console.log("Column article_revisions.listen_enabled:", listenCol[0]?.column_name ?? "(missing)");
  console.log("Function:", fn[0]?.proname ?? "(missing)");

  process.exit(tables.length === 1 && listenCol.length === 1 && fn.length >= 1 ? 0 : 1);
} catch (error) {
  console.error("Migration failed:", error instanceof Error ? error.message : error);
  process.exit(2);
} finally {
  await sql.end({ timeout: 5 });
}
