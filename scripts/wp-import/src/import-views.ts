import { sql } from "drizzle-orm";
import { createScriptDb } from "@newspoint/db/node";
import { parseViewCount } from "./view-count";

delete process.env.DATABASE_URL;
delete process.env.DATABASE_URL_SESSION;

const SOURCE = "https://newspoint.bg/wp-json/post-views-counter/get-post-views";
const CONCURRENCY = 12;

type Row = { id: string; legacyId: number };

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then((value) => { clearTimeout(timer); resolve(value); }, (error) => { clearTimeout(timer); reject(error); });
  });
}

async function fetchViews(legacyId: number): Promise<number> {
  let last = "failed";
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await withTimeout(fetch(`${SOURCE}/${legacyId}`, {
        headers: { accept: "text/plain, application/json", "user-agent": "NewsPoint/2.0 view-import" },
      }), 12_000);
      if (response.status === 429 || response.status >= 500) {
        last = String(response.status);
        await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
        continue;
      }
      if (!response.ok) throw new Error(String(response.status));
      const count = parseViewCount(await response.text());
      if (count === null) throw new Error("unreadable count");
      return count;
    } catch (error) {
      last = error instanceof Error ? error.message : "failed";
      await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
    }
  }
  throw new Error(last);
}

async function mapPool<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  async function run() {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await worker(items[index]!);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => run()));
  return results;
}

const { db, close } = createScriptDb("dev");
try {
  const rows = await db.execute<{ id: string; legacy_id: string | number }>(sql`
    select a.id, a.legacy_id
    from articles a
    left join article_read_counts r on r.article_id = a.id
    where a.source_system = 'wordpress' and a.legacy_id is not null
      and (r.article_id is null or r.read_count <= 1)
    order by a.legacy_id
  `);
  const articles: Row[] = rows.flatMap((row) => {
    const legacyId = Number(row.legacy_id);
    return Number.isSafeInteger(legacyId) && legacyId > 0 ? [{ id: row.id, legacyId }] : [];
  });
  console.log(`wordpress articles ${articles.length}`);
  let saved = 0;
  const failed: Array<{ legacyId: number; error: string }> = [];
  const pending: Array<{ id: string; count: number }> = [];
  let gate = Promise.resolve();
  const exclusive = <T>(work: () => Promise<T>) => {
    const run = gate.then(work, work);
    gate = run.then(() => undefined, () => undefined);
    return run;
  };

  async function flush() {
    if (!pending.length) return;
    const batch = pending.splice(0, pending.length);
    const values = sql.join(batch.map((row) => sql`(${row.id}::uuid, ${row.count}::bigint, now())`), sql`, `);
    await db.execute(sql`
      insert into article_read_counts (article_id, read_count, updated_at)
      values ${values}
      on conflict (article_id) do update
      set read_count = excluded.read_count, updated_at = now()
    `);
    saved += batch.length;
    console.log(`saved ${saved}/${articles.length}`);
  }

  await mapPool(articles, CONCURRENCY, async (article) => {
    try {
      const count = await fetchViews(article.legacyId);
      await exclusive(async () => {
        pending.push({ id: article.id, count });
        if (pending.length >= 200) await flush();
      });
    } catch (error) {
      failed.push({ legacyId: article.legacyId, error: error instanceof Error ? error.message : "failed" });
    }
  });
  await exclusive(flush);

  const samples = articles.filter((_, index) => index % Math.ceil(articles.length / 5) === 0).slice(0, 5);
  for (const sample of samples) {
    const fresh = await fetchViews(sample.legacyId);
    const [stored] = await db.execute<{ read_count: string | number }>(sql`
      select read_count from article_read_counts where article_id = ${sample.id}::uuid
    `);
    console.log(`sample wp ${sample.legacyId}: stored ${stored?.read_count ?? "missing"} live ${fresh}`);
  }
  console.log(`VIEW_IMPORT_DONE saved ${saved} failed ${failed.length}`);
  for (const failure of failed.slice(0, 20)) console.log(`  failed ${failure.legacyId}: ${failure.error}`);
  if (failed.length) process.exitCode = 1;
} finally {
  await close();
}
