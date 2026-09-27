import { and, eq, or, sql } from "drizzle-orm";
import { articleBody, BODY_VERSION, imageVariantsSchema, type ImageVariant, type ArticleBody } from "@newspoint/content";
import {
  articleCategories,
  articles,
  categories,
  mediaAssets,
  mediaPresentations,
  hasMediaPresentations,
  outboxEvents,
  type OutboxPayload,
  type ScriptDb,
} from "@newspoint/db/node";
import type { DraftBlock } from "./convert";

export interface MediaInput {
  wpId: number | null;
  sourceUrl: string;
  width: number | null;
  height: number | null;
  mime: string | null;
  alt: string;
  caption: string;
  variants?: ImageVariant[];
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

export interface CategoryRow {
  id: string;
  slug: string;
  kind: string;
  inMenu: boolean;
}

export type CategoryIds = Map<number, CategoryRow>;

export type SaveChange = "created" | "updated" | "unchanged";

export interface SaveResult {
  id: string;
  change: SaveChange;
  version: number;
  eventId: number | null;
}

export interface SaveOptions {
  /** Rewrite even when WordPress reports no modification (re-conversion). */
  force?: boolean;
  /** Write an outbox event for public changes (live sync). */
  emit?: boolean;
}

/** Same modification time means WordPress has nothing new for us. */
export function detectChange(
  existing: { sourceModifiedAt: Date | null } | undefined,
  incoming: { sourceModifiedAt: Date | null },
): SaveChange {
  if (!existing) return "created";
  return existing.sourceModifiedAt?.getTime() === incoming.sourceModifiedAt?.getTime() ? "unchanged" : "updated";
}

export async function upsertCategories(db: ScriptDb, input: CategoryInput[]): Promise<CategoryIds> {
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
  const rows = await db
    .select({ id: categories.id, wpId: categories.wpId, slug: categories.slug, kind: categories.kind, inMenu: categories.inMenu })
    .from(categories);
  return new Map(rows.filter((row) => row.wpId !== null).map(({ wpId, ...row }) => [wpId!, row]));
}

async function upsertMedia(tx: Tx, media: MediaInput, presentationReady: boolean): Promise<string> {
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
    await saveVariants(tx, existing.id, media, presentationReady);
    return existing.id;
  }
  const [inserted] = await tx
    .insert(mediaAssets)
    .values({ provider: "wordpress_origin", ...values })
    .returning({ id: mediaAssets.id });
  await saveVariants(tx, inserted!.id, media, presentationReady);
  return inserted!.id;
}

async function saveVariants(tx: Tx, id: string, media: MediaInput, ready: boolean) {
  if (!ready || !media.variants) return;
  const variants = imageVariantsSchema.parse(media.variants);
  await tx.insert(mediaPresentations).values({ mediaAssetId: id, variants })
    .onConflictDoUpdate({ target: mediaPresentations.mediaAssetId, set: { variants } });
  // WordPress refresh never changes an editor's focal point.
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
  categoryIds: CategoryIds,
  options: SaveOptions = {},
): Promise<SaveResult> {
  const presentationReady = await hasMediaPresentations(db);
  return db.transaction(async (tx) => {
    const [collision] = await tx.select({ id: categories.id }).from(categories).where(eq(categories.path, article.path)).limit(1);
    if (collision) throw new Error(`path ${article.path} is already used by a category`);

    const [existing] = await tx
      .select({ id: articles.id, version: articles.version, sourceModifiedAt: articles.sourceModifiedAt })
      .from(articles)
      .where(and(eq(articles.sourceSystem, "wordpress"), eq(articles.legacyId, article.legacyId)))
      .limit(1);
    const change = detectChange(existing, article);
    if (existing && change === "unchanged" && !options.force) {
      return { id: existing.id, change, version: existing.version, eventId: null };
    }
    const version = !existing ? 1 : change === "updated" ? existing.version + 1 : existing.version;

    const heroId = hero ? await upsertMedia(tx, hero, presentationReady) : null;
    const imageIds: string[] = [];
    for (const image of inlineImages) imageIds.push(await upsertMedia(tx, image, presentationReady));
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
      version,
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

    let eventId: number | null = null;
    if (options.emit && change !== "unchanged" && article.isPublic) {
      const payload: OutboxPayload = {
        path: article.path,
        title: article.title,
        topics: linked.map((row) => row.slug),
      };
      const [event] = await tx
        .insert(outboxEvents)
        .values({ type: change === "created" ? "article.published" : "article.updated", entityId: saved!.id, version, payload })
        .returning({ id: outboxEvents.id });
      eventId = event!.id;
    }
    return { id: saved!.id, change, version, eventId };
  });
}

export async function countArticles(db: ScriptDb): Promise<number> {
  const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(articles);
  return row?.count ?? 0;
}
