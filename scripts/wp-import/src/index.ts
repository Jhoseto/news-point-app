import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { findRepoRoot, loadRootEnv } from "@newspoint/db/node";
import { MENU } from "./category-map";
import { convertWordPressHtml } from "./convert";
import { heroInput, inlineInputs, toArticleInput, toCategoryInputs } from "./map";
import { buildReport, type ReportArticle } from "./report";
import { WpClient, type WpPost } from "./wp-client";

const { values: args } = parseArgs({
  options: {
    "dry-run": { type: "boolean", default: false },
    since: { type: "string" },
    latest: { type: "string" },
    "per-category": { type: "string" },
  },
});

loadRootEnv();
const baseUrl = process.env.WP_SOURCE_URL ?? "https://newspoint.bg";
const latestCount = Number(args.latest ?? process.env.IMPORT_LATEST_COUNT ?? 40);
const perCategory = Number(args["per-category"] ?? process.env.IMPORT_PER_CATEGORY_COUNT ?? 8);
const dryRun = args["dry-run"];

const client = new WpClient(baseUrl);

const wpCategories = await client.categories();
const categoryInputs = toCategoryInputs(wpCategories);

const posts = new Map<number, WpPost>();
const addPosts = (list: WpPost[]) => list.forEach((post) => posts.set(post.id, post));

if (args.since) {
  addPosts(await client.posts({ modified_after: args.since, orderby: "modified", order: "asc", per_page: 100 }));
} else {
  addPosts(await client.posts({ per_page: latestCount, orderby: "date", order: "desc" }));
  for (const entry of MENU) {
    const category = wpCategories.find((item) => item.slug === entry.slug);
    if (!category) {
      console.warn(`menu category ${entry.slug} not found on the source site`);
      continue;
    }
    addPosts(await client.posts({ categories: category.id, per_page: perCategory, orderby: "date", order: "desc" }));
  }
}

const reportArticles: ReportArticle[] = [];
let db: Awaited<ReturnType<typeof openDb>> | null = null;

async function openDb() {
  const { createScriptDb } = await import("@newspoint/db/node");
  const persist = await import("./persist");
  const handle = createScriptDb("dev");
  const categoryIds = await persist.upsertCategories(handle.db, categoryInputs);
  return { ...handle, persist, categoryIds };
}

if (!dryRun) db = await openDb();

for (const post of [...posts.values()].sort((a, b) => b.date_gmt.localeCompare(a.date_gmt))) {
  const article = toArticleInput(post);
  const conversion = convertWordPressHtml(post.content.rendered, baseUrl);
  const hero = heroInput(post);
  const entry: ReportArticle = { article, hero, conversion, error: null };
  try {
    if (db) {
      // The import re-converts every article; live events come only from the sync.
      await db.persist.saveArticle(db.db, article, hero, inlineInputs(conversion), conversion.blocks, db.categoryIds, { force: true });
    } else {
      const { resolveDraftBlocks } = await import("./persist");
      resolveDraftBlocks(conversion.blocks, conversion.images.map(() => randomUUID()));
    }
  } catch (error) {
    entry.error = (error as Error).message.split("\n")[0] ?? "unknown error";
  }
  reportArticles.push(entry);
}

const totalInDb = db ? await db.persist.countArticles(db.db) : null;
await db?.close();

const reportPath = resolve(findRepoRoot(), "docs", "import-report.md");
writeFileSync(
  reportPath,
  buildReport({
    dryRun,
    since: args.since ?? null,
    requests: client.requests,
    categories: categoryInputs,
    articles: reportArticles,
    totalInDb,
  }),
);

const failed = reportArticles.filter((entry) => entry.error).length;
console.log(
  `${dryRun ? "[dry-run] " : ""}${reportArticles.length} articles, ${failed} failed, ${client.requests} requests. Report: ${reportPath}`,
);
process.exitCode = failed ? 1 : 0;
