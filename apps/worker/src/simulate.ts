// Test tool for T7 acceptance: records N "article.updated" (or, with
// --published, "article.published") events for real, already public articles
// without changing their content. Nothing is invented;
// the events only make open pages refresh.
import { parseArgs } from "node:util";
import { and, desc, eq, lte, sql } from "drizzle-orm";
import { articles, createScriptDb, outboxEvents } from "@newspoint/db/node";
import { assertOutboxReady } from "./outbox-ready";

const { values: args } = parseArgs({
  options: {
    count: { type: "string", default: "20" },
    "delay-ms": { type: "string", default: "250" },
    // Replays "article.published" for the latest real articles to preview the new-article notification.
    published: { type: "boolean", default: false },
  },
});
const type = args.published ? "article.published" : "article.updated";
const count = Math.min(100, Math.max(1, Number(args.count)));
const delayMs = Math.max(0, Number(args["delay-ms"]));

const { db, close } = createScriptDb("dev");
try {
  await assertOutboxReady(db);
  const rows = await db
    .select({ id: articles.id, path: articles.path, title: articles.title, version: articles.version })
    .from(articles)
    .where(and(eq(articles.isPublic, true), lte(articles.publishedAt, sql`now()`)))
    .orderBy(desc(articles.publishedAt))
    .limit(count);

  for (const [index, row] of rows.entries()) {
    const [event] = await db
      .insert(outboxEvents)
      .values({ type, entityId: row.id, version: row.version, payload: { path: row.path, title: row.title, topics: [] } })
      .returning({ id: outboxEvents.id });
    console.log(`${index + 1}/${rows.length} event ${event!.id} ${row.path}`);
    if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
} finally {
  await close();
}
