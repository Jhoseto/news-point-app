import https from "node:https";
import { readFileSync } from "node:fs";
import postgres from "/home/np2/newspoint-app/node_modules/.pnpm/postgres@3.4.9/node_modules/postgres/src/index.js";

const envFile = "/home/np2/newspoint-app/.env.local";
const line = readFileSync(envFile, "utf8").split(/\n/).find((item) => item.startsWith("DATABASE_URL="));
if (!line) throw new Error("DATABASE_URL missing");
const sql = postgres(line.slice("DATABASE_URL=".length).trim(), { prepare: false, max: 1, connect_timeout: 10 });

function parseViewCount(body) {
  const value = Number(String(body).trim());
  if (!Number.isSafeInteger(value) || value < 0) return null;
  return value;
}

function getCount(legacyId) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        host: "95.217.114.220",
        servername: "newspoint.bg",
        path: `/wp-json/post-views-counter/get-post-views/${legacyId}`,
        method: "GET",
        rejectUnauthorized: false,
        headers: { host: "newspoint.bg", accept: "text/plain", "user-agent": "NewsPoint/2.0 view-import" },
        timeout: 15_000,
      },
      (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => resolve({ status: response.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") }));
      },
    );
    req.on("timeout", () => { req.destroy(); reject(new Error("timeout")); });
    req.on("error", reject);
    req.end();
  });
}

async function fetchViews(legacyId) {
  let last = "failed";
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      const result = await getCount(legacyId);
      if (result.body.includes("MalCare") || result.body.includes("Just a moment")) {
        last = "blocked";
        await new Promise((resolve) => setTimeout(resolve, 20_000 * attempt));
        continue;
      }
      if (result.status === 429 || result.status >= 500) {
        last = String(result.status);
        await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
        continue;
      }
      if (result.status !== 200) throw new Error(String(result.status));
      const count = parseViewCount(result.body);
      if (count === null) throw new Error("unreadable count");
      return count;
    } catch (error) {
      last = error instanceof Error ? error.message : "failed";
      await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
    }
  }
  throw new Error(last);
}

const rows = await sql`
  select a.id, a.legacy_id
  from articles a
  left join article_read_counts r on r.article_id = a.id
  where a.source_system = 'wordpress' and a.legacy_id is not null
    and (r.article_id is null or r.read_count <= 1)
  order by a.legacy_id
`;
console.log(`remaining ${rows.length}`);
let saved = 0;
const failed = [];
const pending = [];
let gate = Promise.resolve();
const exclusive = (work) => {
  const run = gate.then(work, work);
  gate = run.then(() => undefined, () => undefined);
  return run;
};

async function flush() {
  if (!pending.length) return;
  const batch = pending.splice(0, pending.length);
  await sql`
    insert into article_read_counts (article_id, read_count, updated_at)
    select item.id, item.count, now()
    from unnest(${batch.map((row) => row.id)}::uuid[], ${batch.map((row) => row.count)}::bigint[]) as item(id, count)
    on conflict (article_id) do update
    set read_count = excluded.read_count, updated_at = now()
  `;
  saved += batch.length;
  console.log(`saved ${saved}/${rows.length}`);
}

const concurrency = 4;
let cursor = 0;
async function worker() {
  while (cursor < rows.length) {
    const index = cursor;
    cursor += 1;
    const row = rows[index];
    const legacyId = Number(row.legacy_id);
    try {
      const count = await fetchViews(legacyId);
      await exclusive(async () => {
        pending.push({ id: row.id, count });
        if (pending.length >= 100) await flush();
      });
    } catch (error) {
      failed.push(`${legacyId}:${error instanceof Error ? error.message : "failed"}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
}
await Promise.all(Array.from({ length: concurrency }, () => worker()));
await exclusive(flush);
console.log(`VIEW_IMPORT_DONE saved ${saved} failed ${failed.length}`);
for (const failure of failed.slice(0, 30)) console.log(`  failed ${failure}`);
await sql.end({ timeout: 5 });
if (failed.length) process.exitCode = 1;
