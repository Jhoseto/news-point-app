import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createTransactionClient } from "../connection";
import { describeConnection, findRepoRoot, loadRootEnv, readDatabaseEnv } from "../env";

loadRootEnv();
const { DATABASE_URL } = readDatabaseEnv("dev");
const root = findRepoRoot();
const migrationPath = resolve(root, "packages/db/migrations/39_social_publishing.sql");

console.log("Target:", describeConnection(DATABASE_URL));
console.log("File:", migrationPath);

const sql = createTransactionClient(DATABASE_URL, 1);
try {
  const [row] = await sql<{ reg: string | null }[]>`
    select to_regclass('public.social_connections')::text as reg
  `;
  if (row?.reg === "social_connections") {
    console.log("Already applied: social_connections exists");
    process.exit(0);
  }

  await sql.unsafe(readFileSync(migrationPath, "utf8"));
  console.log("Applied: 39_social_publishing.sql");

  const [after] = await sql<{ social: string | null; oauth: string | null }[]>`
    select
      to_regclass('public.social_connections')::text as social,
      to_regclass('public.social_oauth_states')::text as oauth
  `;
  const ok = after?.social === "social_connections" && after?.oauth === "social_oauth_states";
  console.log("Verify:", after);
  process.exit(ok ? 0 : 1);
} catch (error) {
  console.error("Migration failed:", error instanceof Error ? error.message : error);
  process.exit(2);
} finally {
  await sql.end({ timeout: 5 });
}
