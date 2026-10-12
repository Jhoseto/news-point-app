import * as dns from "node:dns";
import https from "node:https";
import { sql } from "drizzle-orm";
import { createScriptDb } from "@newspoint/db/node";
import { parseViewCount } from "./view-count";

delete process.env.DATABASE_URL;
delete process.env.DATABASE_URL_SESSION;

const SOURCE_BASE = process.env.WP_SOURCE_URL ?? "https://newspoint.bg";
const SOURCE_ADDRESS = process.env.WP_SOURCE_ADDRESS?.trim() ?? "";
const CONCURRENCY = Math.min(32, Math.max(1, Number(process.env.WP_IMPORT_VIEW_CONCURRENCY ?? 24) || 24));
/** When unset, only backfill suspiciously low counts (live hits before import). Set to 1 to refresh every WP article. */
const IMPORT_ALL = process.env.WP_IMPORT_VIEWS_ALL === "1";
const LOW_COUNT_CEILING = Math.max(1, Number(process.env.WP_IMPORT_VIEW_LOW_CEILING ?? 100) || 100);

type Row = { id: string; legacyId: number };

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then((value) => { clearTimeout(timer); resolve(value); }, (error) => { clearTimeout(timer); reject(error); });
  });
}

function pinnedLookup(hostname: string, options: dns.LookupOptions | ((error: NodeJS.ErrnoException | null, address: string, family: number) => void), callback?: (error: NodeJS.ErrnoException | null, address: string, family: number) => void) {
  const done = typeof options === "function" ? options : callback;
  const lookupOptions = typeof options === "function" ? {} : options;
  if (!done) return;
  if (SOURCE_ADDRESS && (hostname === "newspoint.bg" || hostname === "www.newspoint.bg")) {
    if (lookupOptions.all) {
      (done as unknown as (error: null, addresses: Array<{ address: string; family: number }>) => void)(null, [{ address: SOURCE_ADDRESS, family: 4 }]);
      return;
    }
    done(null, SOURCE_ADDRESS, 4);
    return;
  }
  dns.lookup(hostname, lookupOptions, done as unknown as (error: NodeJS.ErrnoException | null, address: string | dns.LookupAddress[], family: number) => void);
}

async function fetchViewBody(legacyId: number): Promise<{ status: number; body: string }> {
  const path = `/wp-json/post-views-counter/get-post-views/${legacyId}`;
  if (!SOURCE_ADDRESS) {
    const response = await withTimeout(fetch(new URL(path, SOURCE_BASE), {
      headers: { accept: "text/plain, application/json", "user-agent": "NewsPoint/2.0 view-import" },
    }), 12_000);
    return { status: response.status, body: await response.text() };
  }
  const url = new URL(path, SOURCE_BASE);
  return new Promise((resolve, reject) => {
    const req = https.request(
      url,
      {
        headers: { accept: "text/plain, application/json", "user-agent": "NewsPoint/2.0 view-import" },
        lookup: pinnedLookup,
        rejectUnauthorized: false,
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () => resolve({ status: response.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") }));
      },
    );
    req.on("error", reject);
    req.end();
  });
}

async function fetchViews(legacyId: number): Promise<number> {
  let last = "failed";
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await fetchViewBody(legacyId);
      if (response.status === 429 || response.status >= 500) {
        last = String(response.status);
        await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
        continue;
      }
      if (response.status < 200 || response.status >= 300) throw new Error(String(response.status));
      const count = parseViewCount(response.body);
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
  const rows = await db.execute<{ id: string; legacy_id: string | number }>(IMPORT_ALL
    ? sql`
      select a.id, a.legacy_id
      from articles a
      where a.source_system = 'wordpress' and a.legacy_id is not null
      order by a.legacy_id
    `
    : sql`
      select a.id, a.legacy_id
      from articles a
      left join article_read_counts r on r.article_id = a.id
      where a.source_system = 'wordpress' and a.legacy_id is not null
        and (r.article_id is null or r.read_count <= ${LOW_COUNT_CEILING})
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
      set read_count = greatest(article_read_counts.read_count, excluded.read_count), updated_at = now()
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
    try {
      const fresh = await fetchViews(sample.legacyId);
      const [stored] = await db.execute<{ read_count: string | number }>(sql`
        select read_count from article_read_counts where article_id = ${sample.id}::uuid
      `);
      console.log(`sample wp ${sample.legacyId}: stored ${stored?.read_count ?? "missing"} live ${fresh}`);
    } catch (error) {
      console.log(`sample wp ${sample.legacyId}: verify skipped (${error instanceof Error ? error.message : "failed"})`);
    }
  }
  console.log(`VIEW_IMPORT_DONE saved ${saved} failed ${failed.length}`);
  for (const failure of failed.slice(0, 20)) console.log(`  failed ${failure.legacyId}: ${failure.error}`);
  if (failed.length) process.exitCode = 1;
} finally {
  await close();
}
