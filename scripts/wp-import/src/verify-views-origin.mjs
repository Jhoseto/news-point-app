import https from "node:https";
import { readFileSync } from "node:fs";
import postgres from "/home/np2/newspoint-app/node_modules/.pnpm/postgres@3.4.9/node_modules/postgres/src/index.js";

const line = readFileSync("/home/np2/newspoint-app/.env.local", "utf8").split(/\n/).find((item) => item.startsWith("DATABASE_URL="));
const sql = postgres(line.slice("DATABASE_URL=".length).trim(), { prepare: false, max: 1, connect_timeout: 10 });

function getCount(legacyId) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      host: "95.217.114.220",
      servername: "newspoint.bg",
      path: `/wp-json/post-views-counter/get-post-views/${legacyId}`,
      method: "GET",
      rejectUnauthorized: false,
      headers: { host: "newspoint.bg", accept: "text/plain" },
      timeout: 15_000,
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => resolve(Buffer.concat(chunks).toString("utf8").trim()));
    });
    req.on("error", reject);
    req.end();
  });
}

const [totals] = await sql`
  select
    (select count(*)::int from articles where source_system = 'wordpress' and legacy_id is not null) as wordpress,
    (select count(*)::int from article_read_counts) as stored,
    (select count(*)::int from articles a left join article_read_counts r on r.article_id = a.id where a.source_system = 'wordpress' and a.legacy_id is not null and r.article_id is null) as missing
`;
console.log(`wordpress=${totals.wordpress} stored=${totals.stored} missing=${totals.missing}`);
const samples = await sql`
  select a.legacy_id, r.read_count
  from articles a
  join article_read_counts r on r.article_id = a.id
  where a.source_system = 'wordpress'
  order by a.legacy_id
  offset 100
  limit 5
`;
for (const sample of samples) {
  const live = await getCount(Number(sample.legacy_id));
  console.log(`wp ${sample.legacy_id} stored ${sample.read_count} live ${live}`);
}
await sql.end({ timeout: 5 });
