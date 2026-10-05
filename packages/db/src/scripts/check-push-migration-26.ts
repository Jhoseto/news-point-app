import { createTransactionClient } from "../connection";
import { loadRootEnv, readDatabaseEnv } from "../env";

loadRootEnv();
const { DATABASE_URL } = readDatabaseEnv("dev");

const sql = createTransactionClient(DATABASE_URL, 1);
try {
  const rows = await sql<{ column_name: string }[]>`
    select column_name
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'push_subscriptions'
      and column_name = 'category_slugs'
  `;
  console.log(rows.length ? "MIGRATION_26_APPLIED: yes" : "MIGRATION_26_APPLIED: no");
} catch (error) {
  console.log("DB_ERROR:", error instanceof Error ? error.message : error);
  process.exit(2);
} finally {
  await sql.end({ timeout: 5 });
}
