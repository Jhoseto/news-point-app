import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createTransactionClient } from "../connection";
import { describeConnection, findRepoRoot, loadRootEnv, readDatabaseEnv } from "../env";

loadRootEnv();
const { DATABASE_URL } = readDatabaseEnv("dev");
const root = findRepoRoot();
const migrationPath = resolve(root, "packages/db/migrations/34_glasat_section.sql");

console.log("Target:", describeConnection(DATABASE_URL));
console.log("File:", migrationPath);

const sql = createTransactionClient(DATABASE_URL, 1);
try {
  const before = await sql<{ kind: string }[]>`
    select kind from public.categories where slug = 'glasat-na-istinata'
  `;
  if (before[0]?.kind === "section") {
    console.log("Already applied: glasat-na-istinata is section");
    process.exit(0);
  }

  await sql.unsafe(readFileSync(migrationPath, "utf8"));
  console.log("Applied: 34_glasat_section.sql");

  const after = await sql<{ slug: string; kind: string; name: string; in_menu: boolean }[]>`
    select slug, kind, name, in_menu from public.categories where slug = 'glasat-na-istinata'
  `;
  console.log(after[0] ?? "(missing)");
  process.exit(after[0]?.kind === "section" ? 0 : 1);
} catch (error) {
  console.error("Migration failed:", error instanceof Error ? error.message : error);
  process.exit(2);
} finally {
  await sql.end({ timeout: 5 });
}
