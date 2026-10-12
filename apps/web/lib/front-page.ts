import "server-only";
import { unstable_cache } from "next/cache";
import { and, eq } from "drizzle-orm";
import {
  CATEGORY_NEXT_COUNT,
  HOME_PAGE_KEY,
  activePlacement,
  arrangementDocumentSchema,
  emptyArrangement,
  nextArrangementChangeAt,
  referencedArticleIds,
  type ArrangementDocument,
} from "@newspoint/content";
import { getDb, hasPageArrangements, pageArrangements } from "@newspoint/db";
import { getSummariesByIds, type ArticleSummary } from "./queries";

export async function loadPublishedArrangement(pageKey: string): Promise<ArrangementDocument> {
  const db = getDb();
  if (!await hasPageArrangements(db)) return emptyArrangement();
  const [row] = await db
    .select({ document: pageArrangements.document })
    .from(pageArrangements)
    .where(and(eq(pageArrangements.pageKey, pageKey), eq(pageArrangements.status, "published")))
    .limit(1);
  const parsed = arrangementDocumentSchema.safeParse(row?.document);
  return parsed.success ? parsed.data : emptyArrangement();
}

const readArrangement = unstable_cache(async (pageKey: string) => {
  const document = await loadPublishedArrangement(pageKey);
  const pinned = await getSummariesByIds(referencedArticleIds(document));
  return { document, pinned: [...pinned] };
}, ["public-arrangement-inputs"], { revalidate: 60, tags: ["public-listings"] });

export async function homeArrangement(): Promise<{ document: ArrangementDocument; pinned: Map<string, ArticleSummary> }> {
  // The homepage caches these inputs as one snapshot; avoid nesting two TTLs.
  const document = await loadPublishedArrangement(HOME_PAGE_KEY);
  const pinned = await getSummariesByIds(referencedArticleIds(document));
  return { document, pinned };
}

export interface CategoryFront {
  pins: ArticleSummary[];
  pinnedIds: string[];
  excludedIds: string[];
  nextChangeAt: number | null;
}

/** Active first-page pins for a rubric. Later archive pages skip these ids so a pinned story is not repeated. */
export async function categoryFront(categoryId: string, now: number): Promise<CategoryFront> {
  const snapshot = await readArrangement(categoryId);
  const document = snapshot.document;
  const pinned = new Map(snapshot.pinned.map(([id, article]) => [id,
    article.publishedAt instanceof Date ? article : { ...article, publishedAt: new Date(article.publishedAt) }]));
  const visible = new Set(pinned.keys());
  const pins: ArticleSummary[] = [];
  const lead = activePlacement(document.slots.lead, now, visible);
  const leadArticle = lead ? pinned.get(lead.articleId) : undefined;
  if (leadArticle) pins.push(leadArticle);
  for (let index = 0; index < CATEGORY_NEXT_COUNT; index += 1) {
    const item = activePlacement(document.slots[`next-${index}`], now, visible);
    const article = item ? pinned.get(item.articleId) : undefined;
    if (article && !pins.some((pin) => pin.id === article.id)) pins.push(article);
  }
  return { pins, pinnedIds: pins.map((article) => article.id), excludedIds: document.excluded,
    nextChangeAt: nextArrangementChangeAt(document, now, visible) };
}
