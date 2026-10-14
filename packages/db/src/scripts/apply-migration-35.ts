import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createTransactionClient } from "../connection";
import { describeConnection, findRepoRoot, loadRootEnv, readDatabaseEnv } from "../env";

loadRootEnv();
const { DATABASE_URL } = readDatabaseEnv("dev");
const root = findRepoRoot();
const migrationPath = resolve(root, "packages/db/migrations/35_podcast_audio_formats.sql");

console.log("Target:", describeConnection(DATABASE_URL));
console.log("File:", migrationPath);

const sql = createTransactionClient(DATABASE_URL, 1);
try {
  const [row] = await sql<{ def: string }[]>`
    select pg_get_constraintdef(oid) as def
    from pg_constraint
    where conname = 'podcasts_audio_key_check'
      and conrelid = 'public.podcasts'::regclass
  `;
  if (row?.def?.includes("m4a")) {
    console.log("Already applied: podcasts_audio_key_check allows m4a");
    process.exit(0);
  }

  await sql.unsafe(readFileSync(migrationPath, "utf8"));
  console.log("Applied: 35_podcast_audio_formats.sql");

  const [after] = await sql<{ def: string }[]>`
    select pg_get_constraintdef(oid) as def
    from pg_constraint
    where conname = 'podcasts_audio_key_check'
      and conrelid = 'public.podcasts'::regclass
  `;
  console.log(after?.def ?? "(constraint missing)");
  process.exit(after?.def?.includes("m4a") ? 0 : 1);
} catch (error) {
  console.error("Migration failed:", error instanceof Error ? error.message : error);
  process.exit(2);
} finally {
  await sql.end({ timeout: 5 });
}
