import { readFileSync } from "node:fs";
import postgres from "postgres";
const line = readFileSync("H:/NewsPoint/news-point-app/.env.local", "utf8").split(/\n/).find((item) => item.startsWith("DATABASE_URL="));
const sql = postgres(line.slice("DATABASE_URL=".length).trim(), { prepare: false, max: 1, connect_timeout: 10 });
try {
  const rows = await sql`
    select storage_key from media_assets
    where storage_key like 'news/2026/09/%' and storage_key not like '%-card.webp'
    order by storage_key desc
    limit 3
  `;
  console.log(rows.map((row) => row.storage_key).join("\n"));
} finally {
  await sql.end({ timeout: 5 });
}
