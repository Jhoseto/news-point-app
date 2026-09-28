import { loadRootEnv } from "@newspoint/db/node";
import { convertWordPressHtml } from "./convert";
import { heroInput, inlineInputs, toArticleInput, toCategoryInputs } from "./map";
import { WpClient } from "./wp-client";

loadRootEnv();
const since = process.argv[2] ?? "2025-09-28T00:00:00Z";
const baseUrl = process.env.WP_SOURCE_URL ?? "https://newspoint.bg";
const client = new WpClient(baseUrl);
const categoryInputs = toCategoryInputs(await client.categories());

const { createScriptDb } = await import("@newspoint/db/node");
const persist = await import("./persist");
const handle = createScriptDb("dev");
const categoryIds = await persist.upsertCategories(handle.db, categoryInputs);

let page = 1;
let totalPages = 1;
let total = 0;
let saved = 0;
let failed = 0;

do {
  const batch = await client.postsPage(since, page);
  totalPages = batch.totalPages;
  total = batch.total;
  if (page === 1) console.log(`year import since ${since}: ${total} posts, ${totalPages} pages`);
  for (const post of batch.posts) {
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
  }
  console.log(`page ${page}/${totalPages}: saved ${saved}, failed ${failed}`);
  page += 1;
} while (page <= totalPages);

console.log(`YEAR_IMPORT_DONE saved ${saved}, failed ${failed}, of ${total}`);
await handle.close();
