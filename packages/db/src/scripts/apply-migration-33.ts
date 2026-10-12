import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createTransactionClient } from "../connection";
import { describeConnection, findRepoRoot, loadRootEnv, readDatabaseEnv } from "../env";

loadRootEnv();
const { DATABASE_URL } = readDatabaseEnv("dev");
const root = findRepoRoot();
const migrationPath = resolve(root, "packages/db/migrations/33_editor_qa_cascade.sql");

console.log("Target:", describeConnection(DATABASE_URL));
console.log("File:", migrationPath);

const sql = createTransactionClient(DATABASE_URL, 1);
try {
  const fk = await sql<{ confdeltype: string }[]>`
    select c.confdeltype
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    where t.relname = 'editor_qa_articles' and c.contype = 'f' and c.conname = 'editor_qa_articles_article_id_fkey'
  `;
  if (fk[0]?.confdeltype === "c") {
    console.log("Already applied: ON DELETE CASCADE on editor_qa_articles.article_id");
    process.exit(0);
  }

  await sql.unsafe(readFileSync(migrationPath, "utf8"));
  console.log("Applied: 33_editor_qa_cascade.sql");

  const after = await sql<{ confdeltype: string }[]>`
    select c.confdeltype
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    where t.relname = 'editor_qa_articles' and c.contype = 'f' and c.conname = 'editor_qa_articles_article_id_fkey'
  `;
  console.log("FK delete action:", after[0]?.confdeltype === "c" ? "CASCADE" : after[0]?.confdeltype ?? "(missing)");
  process.exit(after[0]?.confdeltype === "c" ? 0 : 1);
} catch (error) {
  console.error("Migration failed:", error instanceof Error ? error.message : error);
  process.exit(2);
} finally {
  await sql.end({ timeout: 5 });
}
