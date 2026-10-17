import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createTransactionClient } from "../connection";
import { describeConnection, findRepoRoot, loadRootEnv, readDatabaseEnv } from "../env";

loadRootEnv();
const { DATABASE_URL } = readDatabaseEnv("dev");
const root = findRepoRoot();
const migrationPath = resolve(root, "packages/db/migrations/37_media_upload_sessions.sql");

console.log("Target:", describeConnection(DATABASE_URL));
console.log("File:", migrationPath);

const sql = createTransactionClient(DATABASE_URL, 1);
try {
  const [row] = await sql<{ reg: string | null }[]>`
    select to_regclass('public.media_upload_sessions')::text as reg
  `;
  if (row?.reg === "media_upload_sessions") {
    console.log("Already applied: media_upload_sessions exists");
    process.exit(0);
  }

  await sql.unsafe(readFileSync(migrationPath, "utf8"));
  console.log("Applied: 37_media_upload_sessions.sql");

  const [after] = await sql<{ reg: string | null; revision: boolean }[]>`
    select
      to_regclass('public.media_upload_sessions')::text as reg,
      exists(
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'podcasts'
          and column_name = 'revision'
      ) as revision
  `;
  const ok = after?.reg === "media_upload_sessions" && after?.revision === true;
  console.log("Verify:", after);
  process.exit(ok ? 0 : 1);
} catch (error) {
  console.error("Migration failed:", error instanceof Error ? error.message : error);
  process.exit(2);
} finally {
  await sql.end({ timeout: 5 });
}
