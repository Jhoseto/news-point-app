import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createTransactionClient } from "../connection";
import { describeConnection, findRepoRoot, loadRootEnv, readDatabaseEnv } from "../env";

loadRootEnv();
const { DATABASE_URL } = readDatabaseEnv("dev");
const root = findRepoRoot();
const migrationPath = resolve(root, "packages/db/migrations/32_na_fokus_public_menu.sql");

console.log("Target:", describeConnection(DATABASE_URL));
console.log("File:", migrationPath);

const sql = createTransactionClient(DATABASE_URL, 1);
try {
  const focus = await sql<{ kind: string; menu_order: number | null; name: string }[]>`
    select kind, menu_order, name from public.categories where slug = 'na-fokus'
  `;
  if (focus[0]?.kind === "section" && focus[0]?.menu_order === 3) {
    console.log("Already applied: na-fokus is section with menu_order 3");
    process.exit(0);
  }

  await sql.unsafe(readFileSync(migrationPath, "utf8"));
  console.log("Applied: 32_na_fokus_public_menu.sql");

  const after = await sql<{ slug: string; kind: string; menu_order: number | null; name: string; in_menu: boolean }[]>`
    select slug, kind, menu_order, name, in_menu
    from public.categories
    where slug in ('na-fokus', 'plovdiv', 'glasat-na-istinata')
    order by menu_order nulls last
  `;
  for (const row of after) {
    console.log(`${row.slug}: kind=${row.kind} menu_order=${row.menu_order} in_menu=${row.in_menu} name=${row.name}`);
  }

  const ok = after.find((row) => row.slug === "na-fokus")?.kind === "section"
    && after.find((row) => row.slug === "na-fokus")?.menu_order === 3;
  process.exit(ok ? 0 : 1);
} catch (error) {
  console.error("Migration failed:", error instanceof Error ? error.message : error);
  process.exit(2);
} finally {
  await sql.end({ timeout: 5 });
}
