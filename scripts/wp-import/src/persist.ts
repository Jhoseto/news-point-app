import { and, eq, or, sql } from "drizzle-orm";
import { articleBody, BODY_VERSION, type ArticleBody } from "@newspoint/content";
import { articleCategories, articles, categories, mediaAssets, type ScriptDb } from "@newspoint/db/node";
import type { DraftBlock } from "./convert";

export interface MediaInput {
  wpId: number | null;
  sourceUrl: string;
  width: number | null;
  height: number | null;
  mime: string | null;
  alt: string;
  caption: string;
}

export interface CategoryInput {
  wpId: number;
  slug: string;
  name: string;
  path: string;
  kind: "section" | "label";
  inMenu: boolean;
  menuOrder: number | null;
}

export interface ArticleInput {
  legacyId: number;
  slug: string;
  path: string;
  sourceUrl: string;
  title: string;
  excerpt: string;
  sourceHtml: string;
  isPublic: boolean;
  publishedAt: Date | null;
  sourceModifiedAt: Date | null;
  categoryWpIds: number[];
}

type Tx = Parameters<Parameters<ScriptDb["transaction"]>[0]>[0];

export async function upsertCategories(db: ScriptDb, input: CategoryInput[]): Promise<Map<number, { id: string; kind: string; inMenu: boolean }>> {
  for (const category of input) {
    await db
      .insert(categories)
      .values(category)
      .onConflictDoUpdate({
        target: categories.wpId,
        set: {
          slug: category.slug,
          name: category.name,
          path: category.path,
          kind: category.kind,
          inMenu: category.inMenu,
          menuOrder: category.menuOrder,
        },
      });
  }
  const rows = await db.select({ id: categories.id, wpId: categories.wpId, kind: categories.kind, inMenu: categories.inMenu }).from(categories);
  return new Map(rows.filter((row) => row.wpId !== null).map((row) => [row.wpId!, row]));
}

async function upsertMedia(tx: Tx, media: MediaInput): Promise<string> {
  const match = media.wpId === null
    ? eq(mediaAssets.sourceUrl, media.sourceUrl)
    : or(eq(mediaAssets.wpId, media.wpId), eq(mediaAssets.sourceUrl, media.sourceUrl));
  const [existing] = await tx
    .select({ id: mediaAssets.id })
    .from(mediaAssets)
    .where(and(eq(mediaAssets.provider, "wordpress_origin"), match))
    .limit(1);

  const values = {
    sourceUrl: media.sourceUrl,
    width: media.width,
    height: media.height,
    mime: media.mime,
    alt: media.alt,
    caption: media.caption,
    ...(media.wpId === null ? {} : { wpId: media.wpId }),
  };
  if (existing) {
    await tx.update(mediaAssets).set(values).where(eq(mediaAssets.id, existing.id));
    return existing.id;
  }
  const [inserted] = await tx
    .insert(mediaAssets)
    .values({ provider: "wordpress_origin", ...values })
    .returning({ id: mediaAssets.id });
  return inserted!.id;
}

export function resolveDraftBlocks(blocks: DraftBlock[], imageIds: string[]): ArticleBody {
  const resolved = blocks.map((block) => {
    if (block.type !== "image") return block;
    const { imageIndex, ...rest } = block;
    return { ...rest, mediaAssetId: imageIds[imageIndex]! };
  });
  return articleBody.parse(resolved);
}

export async function saveArticle(
  db: ScriptDb,
  article: ArticleInput,
  hero: MediaInput | null,
  inlineImages: MediaInput[],
  blocks: DraftBlock[],
  categoryIds: Map<number, { id: string; kind: string; inMenu: boolean }>,
): Promise<void> {
  await db.transaction(async (tx) => {
    const [collision] = await tx.select({ id: categories.id }).from(categories).where(eq(categories.path, article.path)).limit(1);
    if (collision) throw new Error(`path ${article.path} is already used by a category`);

    const heroId = hero ? await upsertMedia(tx, hero) : null;
    const imageIds: string[] = [];
    for (const image of inlineImages) imageIds.push(await upsertMedia(tx, image));
    const body = resolveDraftBlocks(blocks, imageIds);

    const linked = article.categoryWpIds.map((wpId) => categoryIds.get(wpId)).filter((row) => row !== undefined);
    const primary = linked.find((row) => row.kind === "section" && row.inMenu) ?? linked.find((row) => row.kind === "section") ?? null;

    const values = {
      sourceSystem: "wordpress" as const,
      legacyId: article.legacyId,
      slug: article.slug,
      path: article.path,
      sourceUrl: article.sourceUrl,
      title: article.title,
      excerpt: article.excerpt,
      heroMediaId: heroId,
      primaryCategoryId: primary?.id ?? null,
      body,
      bodyVersion: BODY_VERSION,
      sourceHtml: article.sourceHtml,
      isPublic: article.isPublic,
      publishedAt: article.publishedAt,
      sourceModifiedAt: article.sourceModifiedAt,
      importedAt: new Date(),
    };
    const { sourceSystem: _s, legacyId: _l, ...updatable } = values;
    const [saved] = await tx
      .insert(articles)
      .values(values)
      .onConflictDoUpdate({ target: [articles.sourceSystem, articles.legacyId], set: updatable })
      .returning({ id: articles.id });

    await tx.delete(articleCategories).where(eq(articleCategories.articleId, saved!.id));
    if (linked.length) {
      await tx.insert(articleCategories).values(linked.map((row) => ({ articleId: saved!.id, categoryId: row.id })));
    }
  });
}

export async function countArticles(db: ScriptDb): Promise<number> {
  const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(articles);
  return row?.count ?? 0;
}
