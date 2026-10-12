/**
 * Paginated import of all published WordPress posts (full archive or from `--since`).
 * Each hero/inline image runs through mirrorNewsImage (same WebP ladder as Studio upload).
 *
 *   pnpm --filter @newspoint/wp-import run wp:import:archive
 *   … -- --since=2000-01-01T00:00:00Z --concurrency=20
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { loadRootEnv, findRepoRoot } from "@newspoint/db/node";
import { convertWordPressHtml } from "./convert";
import { mapPool } from "./import-pool";
import { heroInput, inlineInputs, toArticleInput, toCategoryInputs } from "./map";
import { WpClient } from "./wp-client";

loadRootEnv();

function arg(name: string, fallback: string): string {
  const hit = process.argv.find((entry) => entry.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

const positionalSince = process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : "";
const since = positionalSince || arg("since", "2000-01-01T00:00:00Z");
const startPage = Math.max(1, Number(arg("page", "1")) || 1);
const concurrency = Math.min(32, Math.max(1, Number(arg("concurrency", process.env.WP_IMPORT_CONCURRENCY ?? "16")) || 16));
const progressPath = resolve(
  process.env.WP_ARCHIVE_PROGRESS?.trim() || resolve(findRepoRoot(), "logs", "wp-archive-import.json"),
);

type Progress = {
  since: string;
  lastPage: number;
  totalPages: number;
  saved: number;
  failed: number;
  total: number;
  concurrency: number;
  updatedAt: string;
};

async function loadProgress(): Promise<Progress> {
  try {
    return JSON.parse(await readFile(progressPath, "utf8")) as Progress;
  } catch {
    return {
      since,
      lastPage: startPage - 1,
      totalPages: 0,
      saved: 0,
      failed: 0,
      total: 0,
      concurrency,
      updatedAt: new Date().toISOString(),
    };
  }
}

async function saveProgress(progress: Progress): Promise<void> {
  progress.updatedAt = new Date().toISOString();
  progress.concurrency = concurrency;
  await mkdir(dirname(progressPath), { recursive: true });
  await writeFile(progressPath, JSON.stringify(progress, null, 2));
}

const baseUrl = process.env.WP_SOURCE_URL ?? "https://newspoint.bg";
const client = new WpClient(baseUrl);
const categoryInputs = toCategoryInputs(await client.categories());

const { createScriptDb } = await import("@newspoint/db/node");
const persist = await import("./persist");
const dbPool = Math.min(32, concurrency + 4);
const handle = createScriptDb("dev", dbPool);
const categoryIds = await persist.upsertCategories(handle.db, categoryInputs);

const progress = await loadProgress();
let page = Math.max(startPage, progress.since === since ? progress.lastPage + 1 : startPage);
let totalPages = 1;
let saved = progress.saved;
let failed = progress.failed;

if (!process.env.MEDIA_ROOT?.trim() && process.env.DEV_REMOTE !== "1") {
  console.warn("MEDIA_ROOT is unset — articles will import but images will stay on WordPress URLs until mirroring runs.");
}

console.log(`archive import concurrency=${concurrency} dbPool=${dbPool} wpPauseMs=${process.env.WP_IMPORT_PAUSE_MS ?? 400}`);

do {
  const batch = await client.postsPage(since, page);
  totalPages = batch.totalPages;
  if (page === startPage || page === progress.lastPage + 1) {
    console.log(`archive import since ${since}: ${batch.total} posts, ${totalPages} pages (from page ${page})`);
    progress.total = batch.total;
    progress.totalPages = batch.totalPages;
  }

  await mapPool(batch.posts, concurrency, async (post) => {
    const article = toArticleInput(post);
    try {
      const conversion = convertWordPressHtml(post.content.rendered, baseUrl);
      await persist.saveArticle(
        handle.db,
        article,
        heroInput(post),
        inlineInputs(conversion),
        conversion.blocks,
        categoryIds,
        { force: true },
      );
      saved += 1;
    } catch (error) {
      failed += 1;
      console.log(`fail ${article.path}: ${(error as Error).message.split("\n")[0]}`);
    }
  });

  progress.lastPage = page;
  progress.totalPages = totalPages;
  progress.saved = saved;
  progress.failed = failed;
  await saveProgress(progress);
  console.log(`page ${page}/${totalPages}: saved ${saved}, failed ${failed}`);
  page += 1;
} while (page <= totalPages);

console.log(`ARCHIVE_IMPORT_DONE saved ${saved}, failed ${failed}, of ${progress.total}`);
await handle.close();
process.exit(failed ? 1 : 0);
