/**
 * Postgres health & performance audit for NewsPoint read paths.
 * Read-only. Writes report under tests/reports/.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createSessionClient } from "../../packages/db/src/connection.ts";
import { findRepoRoot, loadRootEnv, readDatabaseEnv } from "../../packages/db/src/env.ts";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = findRepoRoot(here);
const reportsDir = resolve(repoRoot, "tests/reports");

type Sql = ReturnType<typeof createSessionClient>;

interface TableStat {
  relname: string;
  n_live_tup: string;
  seq_scan: string;
  idx_scan: string;
  seq_tup_read: string;
}

interface IndexStat {
  tablename: string;
  indexname: string;
  idx_scan: string;
  idx_tup_read: string;
}

interface ExplainCase {
  id: string;
  label: string;
  sql: string;
  params?: unknown[];
}

interface CaseResult {
  id: string;
  label: string;
  planningMs: number | null;
  executionMs: number | null;
  rows: number | null;
  sharedHit: number | null;
  sharedRead: number | null;
  usesSeqScanOn: string[];
  warnings: string[];
  planJson: unknown;
}

function fmtMs(value: number | null): string {
  if (value === null || Number.isNaN(value)) return "—";
  if (value < 1) return `${(value * 1000).toFixed(1)} ms`;
  return `${value.toFixed(2)} s`;
}

function walkPlan(node: Record<string, unknown>, seqScans: string[], depth = 0): void {
  const type = String(node["Node Type"] ?? "");
  const rel = node["Relation Name"] ? String(node["Relation Name"]) : null;
  if (type === "Seq Scan" && rel) seqScans.push(rel);
  const children = node["Plans"];
  if (Array.isArray(children)) {
    for (const child of children) {
      if (child && typeof child === "object") walkPlan(child as Record<string, unknown>, seqScans, depth + 1);
    }
  }
}

async function runExplain(sql: Sql, item: ExplainCase): Promise<CaseResult> {
  const warnings: string[] = [];
  const seqScans: string[] = [];
  let planJson: unknown = null;
  let planningMs: number | null = null;
  let executionMs: number | null = null;
  let rows: number | null = null;
  let sharedHit: number | null = null;
  let sharedRead: number | null = null;

  try {
    const rowsOut = item.params?.length
      ? await sql.unsafe(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${item.sql}`, item.params as never[])
      : await sql.unsafe(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${item.sql}`);
    const root: unknown = Array.isArray(rowsOut) ? rowsOut[0] : rowsOut;
    const payload =
      root !== null && typeof root === "object" && "QUERY PLAN" in root
        ? (root as Record<string, unknown>)["QUERY PLAN"]
        : rowsOut;
    const planArr = Array.isArray(payload) ? payload : [payload];
    planJson = planArr[0];
    const plan = planArr[0] as Record<string, unknown>;
    const inner = plan["Plan"] as Record<string, unknown> | undefined;
    if (inner) walkPlan(inner, seqScans);
    planningMs = Number(plan["Planning Time"] ?? NaN) / 1000;
    executionMs = Number(plan["Execution Time"] ?? NaN) / 1000;
    if (inner) {
      rows = Number(inner["Actual Rows"] ?? NaN);
      const hit = Number(inner["Shared Hit Blocks"] ?? NaN);
      const read = Number(inner["Shared Read Blocks"] ?? NaN);
      sharedHit = Number.isFinite(hit) ? hit : null;
      sharedRead = Number.isFinite(read) ? read : null;
    }
  } catch (error) {
    warnings.push(error instanceof Error ? error.message : "EXPLAIN failed");
  }

  for (const table of seqScans) {
    if (["articles", "article_categories"].includes(table)) {
      warnings.push(`Seq Scan върху ${table} — проверете обема и дали index scan е възможен.`);
    }
  }
  if (executionMs !== null && executionMs > 0.05) {
    warnings.push(`Изпълнение над 50 ms (${fmtMs(executionMs)}).`);
  }

  return {
    id: item.id,
    label: item.label,
    planningMs: Number.isFinite(planningMs!) ? planningMs : null,
    executionMs: Number.isFinite(executionMs!) ? executionMs : null,
    rows: Number.isFinite(rows!) ? rows : null,
    sharedHit,
    sharedRead,
    usesSeqScanOn: [...new Set(seqScans)],
    warnings,
    planJson,
  };
}

async function sampleCategoryId(sql: Sql): Promise<string | null> {
  const [row] = await sql<{ id: string }[]>`
    select c.id
    from article_categories ac
    join categories c on c.id = ac.category_id
    group by c.id
    order by count(*) desc
    limit 1`;
  return row?.id ?? null;
}

async function sampleArticlePath(sql: Sql): Promise<string | null> {
  const [row] = await sql<{ path: string }[]>`
    select path from articles
    where is_public and published_at <= now()
    order by published_at desc
    limit 1`;
  return row?.path ?? null;
}

function buildCases(categoryId: string | null, articlePath: string | null): ExplainCase[] {
  const cases: ExplainCase[] = [
    {
      id: "latest-50",
      label: "Последни 50 (articles_public_published_idx)",
      sql: `
        select a.id from articles a
        where a.is_public and a.published_at <= now()
        order by a.published_at desc
        limit 50`,
    },
    {
      id: "latest-24h",
      label: "Последни 24 часа",
      sql: `
        select a.id from articles a
        where a.is_public and a.published_at <= now()
          and a.published_at > now() - interval '24 hours'
        order by a.published_at desc`,
    },
    {
      id: "page-arrangements",
      label: "Публикувано подреждане (home)",
      sql: `
        select id from page_arrangements
        where page_key = 'home' and status = 'published'
        limit 1`,
    },
  ];

  if (categoryId) {
    cases.push({
      id: "by-category",
      label: "Рубрика по category_id (най-голям архив)",
      sql: `
        select a.id
        from articles a
        inner join article_categories ac on ac.article_id = a.id
        where a.is_public and a.published_at <= now() and ac.category_id = $1
        order by a.published_at desc
        limit 16`,
      params: [categoryId],
    });
  }

  if (articlePath) {
    cases.push({
      id: "article-by-path",
      label: "Статия по path (unique)",
      sql: `
        select a.id from articles a
        where a.path = $1 and a.is_public and a.published_at <= now()
        limit 1`,
      params: [articlePath],
    });
  }

  cases.push({
    id: "search-ilike",
    label: "Търсене ILIKE по заглавие (без trigram индекс)",
    sql: `
      select a.id from articles a
      where a.is_public and a.published_at <= now()
        and a.title ilike $1
      order by a.published_at desc
      limit 20`,
    params: ["%нов%"],
  });

  return cases;
}

function verdict(results: CaseResult[], tableStats: TableStat[]): string[] {
  const lines: string[] = [];
  const articles = tableStats.find((t) => t.relname === "articles");
  const artSeq = articles ? Number(articles.seq_scan) : 0;
  const artIdx = articles ? Number(articles.idx_scan) : 0;
  const articleRows = articles ? Number(articles.n_live_tup) : 0;

  const slow = results.filter((r) => (r.executionMs ?? 0) > 0.05);
  const search = results.find((r) => r.id === "search-ilike");

  if (slow.length === 0) {
    lines.push("**Горещите заявки** в момента са под ~50 ms на сървъра (с ANALYZE). Това е **добър** знак за текущия обем.");
  } else {
    lines.push(`**${slow.length}** заявки над 50 ms — вижте детайлите по-долу (може да включва мрежов/тунел ефект при локален одит).`);
  }

  if (artIdx > 0 && artSeq > 0 && artIdx > artSeq * 10) {
    lines.push("**articles:** index scan доминира над seq scan в статистиката — индексите се ползват.");
  } else if (articleRows > 50000 && artSeq > artIdx) {
    lines.push("**articles:** много seq scans спрямо index scans — обмислете `EXPLAIN` на конкретни бавни страници или `VACUUM ANALYZE`.");
  } else {
    lines.push("**articles:** съотношението seq/index scan е приемливо за текущия етап (или статистиката е още млада).");
  }

  if (search?.usesSeqScanOn.includes("articles")) {
    lines.push("**Търсене:** seq scan без `pg_trgm` — следете времето; при ~20k статии може още да е приемливо.");
  } else if (search && (search.executionMs ?? 0) < 0.05) {
    lines.push("**Търсене:** при текущия обем заявката е бърза; `pg_trgm` — само ако потребителите оплакват бавно търсене.");
  }

  const categories = tableStats.find((t) => t.relname === "categories");
  if (categories && Number(categories.n_live_tup) < 1000 && Number(categories.seq_scan) > 1000) {
    lines.push("**categories:** много seq_scan при малко редове — нормално (таблицата е ~20 реда); не изисква нов индекс.");
  }

  lines.push("**Начало:** броят SQL заявки на едно зареждане (много рубрики + етикети) често доминира над един липсващ индекс — ISR `revalidate=60` и медията са отделен фактор.");
  lines.push("**Препоръка:** нови индекси **само** след конкретен бавен екран; не пускайте „preventive“ миграции без отчет като този.");

  return lines;
}

function renderReport(input: {
  generatedAt: string;
  pgVersion: string;
  tableStats: TableStat[];
  indexStats: IndexStat[];
  indexesOnArticles: { indexname: string; indexdef: string }[];
  results: CaseResult[];
  categoryId: string | null;
  articlePath: string | null;
}): string {
  const lines: string[] = [
    "# DB audit — NewsPoint",
    "",
    `Генериран: ${input.generatedAt}`,
    "",
    "## Postgres",
    "",
    `\`${input.pgVersion.trim()}\``,
    "",
    "## Обеми и scan статистика (pg_stat)",
    "",
    "| Таблица | ~Редове | seq_scan | idx_scan |",
    "|---------|---------|----------|----------|",
  ];

  for (const t of input.tableStats) {
    lines.push(`| ${t.relname} | ${t.n_live_tup} | ${t.seq_scan} | ${t.idx_scan} |`);
  }

  lines.push("", "## Индекси на `articles`", "");
  for (const idx of input.indexesOnArticles) {
    lines.push(`- \`${idx.indexname}\`: ${idx.indexdef}`);
  }

  lines.push("", "## Индекси с най-много scan (top 12)", "", "| Таблица | Индекс | idx_scan |", "|---------|--------|----------|");
  for (const row of input.indexStats.slice(0, 12)) {
    lines.push(`| ${row.tablename} | ${row.indexname} | ${row.idx_scan} |`);
  }

  lines.push("", "## EXPLAIN ANALYZE (горещи заявки)", "");
  if (input.categoryId) lines.push(`- Пример category_id: \`${input.categoryId}\``);
  if (input.articlePath) lines.push(`- Пример path: \`${input.articlePath}\``);
  lines.push("");

  for (const r of input.results) {
    lines.push(`### ${r.label}`, "");
    lines.push(`- Планиране: ${fmtMs(r.planningMs)}`);
    lines.push(`- Изпълнение: ${fmtMs(r.executionMs)}`);
    lines.push(`- Редове: ${r.rows ?? "—"}`);
    if (r.sharedHit !== null) lines.push(`- Buffer hit/read: ${r.sharedHit} / ${r.sharedRead ?? 0}`);
    if (r.usesSeqScanOn.length) lines.push(`- Seq Scan на: ${r.usesSeqScanOn.join(", ")}`);
    if (r.warnings.length) {
      lines.push("- **Бележки:**");
      for (const w of r.warnings) lines.push(`  - ${w}`);
    } else lines.push("- **Бележки:** няма");
    lines.push("");
  }

  lines.push("## Изводи", "");
  for (const v of verdict(input.results, input.tableStats)) {
    lines.push(`- ${v}`);
  }
  lines.push("");

  return lines.join("\n");
}

async function main(): Promise<void> {
  loadRootEnv();
  const env = readDatabaseEnv("dev");
  const sql = createSessionClient(env.DATABASE_URL_SESSION);

  try {
    const [{ version }] = await sql<{ version: string }[]>`select version()`;

    const tableStats = await sql<TableStat[]>`
      select relname, n_live_tup::text, seq_scan::text, idx_scan::text, seq_tup_read::text
      from pg_stat_user_tables
      where schemaname = 'public'
        and relname in ('articles', 'article_categories', 'categories', 'page_arrangements', 'media_assets')
      order by relname`;

    const indexStats = await sql<IndexStat[]>`
      select relname as tablename, indexrelname as indexname, idx_scan::text, idx_tup_read::text
      from pg_stat_user_indexes
      where schemaname = 'public'
      order by idx_scan desc nulls last
      limit 20`;

    const indexesOnArticles = await sql<{ indexname: string; indexdef: string }[]>`
      select indexname, indexdef
      from pg_indexes
      where schemaname = 'public' and tablename = 'articles'
      order by indexname`;

    const categoryId = await sampleCategoryId(sql);
    const articlePath = await sampleArticlePath(sql);
    const cases = buildCases(categoryId, articlePath);
    const results: CaseResult[] = [];
    for (const item of cases) {
      results.push(await runExplain(sql, item));
    }

    const generatedAt = new Date().toISOString();
    const markdown = renderReport({
      generatedAt,
      pgVersion: version,
      tableStats,
      indexStats,
      indexesOnArticles,
      results,
      categoryId,
      articlePath,
    });

    mkdirSync(reportsDir, { recursive: true });
    const stamp = generatedAt.replace(/[:.]/g, "-").slice(0, 19);
    const stampedPath = resolve(reportsDir, `db-audit-${stamp}.md`);
    const latestPath = resolve(reportsDir, "db-audit-latest.md");
    writeFileSync(stampedPath, markdown, "utf8");
    writeFileSync(latestPath, markdown, "utf8");

    console.log(`Report: ${stampedPath}`);
    console.log(`Latest: ${latestPath}`);
    const failed = results.some((r) => r.warnings.some((w) => w.includes("EXPLAIN failed")));
    process.exitCode = failed ? 1 : 0;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

await main();
