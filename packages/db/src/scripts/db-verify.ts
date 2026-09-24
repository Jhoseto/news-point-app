import { getTableConfig } from "drizzle-orm/pg-core";
import { createSessionClient } from "../connection";
import { loadRootEnv, readDatabaseEnv } from "../env";
import { schemaTables } from "../schema";

loadRootEnv();
const env = readDatabaseEnv("dev");
const sql = createSessionClient(env.DATABASE_URL_SESSION);

let ok = true;
try {
  for (const table of Object.values(schemaTables)) {
    const config = getTableConfig(table);
    const rows = await sql<{ column_name: string }[]>`
      select column_name from information_schema.columns
      where table_schema = 'public' and table_name = ${config.name}`;
    const inDb = new Set(rows.map((row) => row.column_name));
    const inSchema = new Set(config.columns.map((column) => column.name));

    if (inDb.size === 0) {
      ok = false;
      console.log(`${config.name}: table missing (apply packages/db/migrations in order)`);
      continue;
    }
    const missing = [...inSchema].filter((name) => !inDb.has(name));
    const extra = [...inDb].filter((name) => !inSchema.has(name));
    if (missing.length || extra.length) ok = false;
    console.log(
      `${config.name}: ${missing.length || extra.length ? "MISMATCH" : "ok"}` +
        (missing.length ? ` | missing in db: ${missing.join(", ")}` : "") +
        (extra.length ? ` | not in schema.ts: ${extra.join(", ")}` : ""),
    );
  }
} finally {
  await sql.end({ timeout: 5 });
}
process.exitCode = ok ? 0 : 1;
