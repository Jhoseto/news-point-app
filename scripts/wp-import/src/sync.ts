import { eq, max } from "drizzle-orm";
import { articles, type ScriptDb } from "@newspoint/db/node";
import { convertWordPressHtml } from "./convert";
import { heroInput, inlineInputs, toArticleInput, toCategoryInputs } from "./map";
import { saveArticle, upsertCategories, type CategoryIds, type SaveChange } from "./persist";
import { WpClient } from "./wp-client";

// modified_after is read as UTC only with an explicit "Z"; without it
// WordPress uses the site's local time. The small overlap covers posts saved
// in the same second; posts seen again are skipped by modification time.
export const CURSOR_OVERLAP_MS = 60 * 1000;
const PAGE_SIZE = 50;

export interface SyncResult {
  cursor: string;
  fetched: number;
  changes: Record<SaveChange, number>;
  failed: { path: string; error: string }[];
  events: number;
  requests: number;
}

export function syncCursor(latestModified: Date | null, now = new Date()): string {
  const base = latestModified ?? new Date(now.getTime() - 24 * 60 * 60 * 1000);
  return new Date(base.getTime() - CURSOR_OVERLAP_MS).toISOString().replace(/\.\d{3}Z$/, "Z");
}

export class WordPressSync {
  private categoryIds: CategoryIds | null = null;

  constructor(
    private readonly db: ScriptDb,
    private readonly baseUrl: string,
  ) {}

  private async refreshCategories(client: WpClient) {
    this.categoryIds = await upsertCategories(this.db, toCategoryInputs(await client.categories()));
  }

  async run(): Promise<SyncResult> {
    const client = new WpClient(this.baseUrl);
    const [row] = await this.db
      .select({ latest: max(articles.sourceModifiedAt) })
      .from(articles)
      .where(eq(articles.sourceSystem, "wordpress"));
    const cursor = syncCursor(row?.latest ?? null);

    const posts = await client.posts({ modified_after: cursor, orderby: "modified", order: "asc", per_page: PAGE_SIZE });
    const result: SyncResult = {
      cursor,
      fetched: posts.length,
      changes: { created: 0, updated: 0, unchanged: 0 },
      failed: [],
      events: 0,
      requests: 0,
    };

    const needsCategories = !this.categoryIds || posts.some((post) => post.categories.some((id) => !this.categoryIds!.has(id)));
    if (posts.length && needsCategories) await this.refreshCategories(client);

    for (const post of posts) {
      const article = toArticleInput(post);
      try {
        const conversion = convertWordPressHtml(post.content.rendered, this.baseUrl);
        const saved = await saveArticle(
          this.db,
          article,
          heroInput(post),
          inlineInputs(conversion),
          conversion.blocks,
          this.categoryIds ?? new Map(),
          { emit: true },
        );
        result.changes[saved.change] += 1;
        if (saved.eventId !== null) result.events += 1;
      } catch (error) {
        result.failed.push({ path: article.path, error: (error as Error).message.split("\n")[0] ?? "unknown error" });
      }
    }
    result.requests = client.requests;
    return result;
  }
}
