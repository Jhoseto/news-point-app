import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { findRepoRoot, loadRootEnv } from "@newspoint/db/node";
import { placeCategory, MENU } from "./category-map";
import { convertWordPressHtml, type Conversion } from "./convert";
import { buildReport, type ReportArticle } from "./report";
import { htmlToPlainText, pathFromLink, wpGmtToDate } from "./text";
import { featuredMedia, WpClient, type WpPost } from "./wp-client";
import type { ArticleInput, CategoryInput, MediaInput } from "./persist";

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
const categoryInputs: CategoryInput[] = wpCategories.map((category) => {
  const placement = placeCategory(category.slug);
  return {
    wpId: category.id,
    slug: category.slug,
    name: placement.displayName ?? htmlToPlainText(category.name),
    path: pathFromLink(category.link),
    kind: placement.kind,
    inMenu: placement.inMenu,
    menuOrder: placement.menuOrder,
  };
});

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

function toArticleInput(post: WpPost): ArticleInput {
  return {
    legacyId: post.id,
    slug: post.slug,
    path: pathFromLink(post.link),
    sourceUrl: post.link,
    title: htmlToPlainText(post.title.rendered),
    excerpt: htmlToPlainText(post.excerpt.rendered).replace(/\s*\[?(…|&hellip;|\.\.\.)\]?$/, "…"),
    sourceHtml: post.content.rendered,
    isPublic: post.status === "publish",
    publishedAt: wpGmtToDate(post.date_gmt),
    sourceModifiedAt: wpGmtToDate(post.modified_gmt),
    categoryWpIds: post.categories,
  };
}

function heroInput(post: WpPost): MediaInput | null {
  const media = featuredMedia(post);
  if (!media) return null;
  return {
    wpId: media.id,
    sourceUrl: media.source_url,
    width: media.media_details?.width ?? null,
    height: media.media_details?.height ?? null,
    mime: media.mime_type ?? null,
    alt: htmlToPlainText(media.alt_text ?? ""),
    caption: htmlToPlainText(media.caption?.rendered ?? ""),
  };
}

function inlineInputs(conversion: Conversion): MediaInput[] {
  return conversion.images.map((image) => ({
    wpId: null,
    sourceUrl: image.src,
    width: image.width,
    height: image.height,
    mime: null,
    alt: image.alt,
    caption: "",
  }));
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
      await db.persist.saveArticle(db.db, article, hero, inlineInputs(conversion), conversion.blocks, db.categoryIds);
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
