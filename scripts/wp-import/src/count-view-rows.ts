import { sql } from "drizzle-orm";
import { createScriptDb } from "@newspoint/db/node";

const { db, close } = createScriptDb("dev");
const [row] = await db.execute<{ articles: number; with_counts: number; over_one: number }>(sql`
  select
    (select count(*)::int from articles where source_system = 'wordpress') as articles,
    (select count(*)::int from article_read_counts) as with_counts,
    (select count(*)::int from article_read_counts where read_count > 1) as over_one
`);
console.log(row);
await close();
