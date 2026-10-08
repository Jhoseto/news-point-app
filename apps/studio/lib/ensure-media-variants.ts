import "server-only";
import { eq } from "drizzle-orm";
import { getDb, mediaAssets, mediaPresentations } from "@newspoint/db";
import { libraryImageUrl } from "@/lib/media-library";
import { readMediaFile, writeMediaFile } from "@/lib/media-disk";
import {
  mergePresentationVariants,
  missingVariantWidths,
  prepareArchiveVariantsFromOriginal,
  variantStorageKey,
  type PhotoVariantSpec,
} from "@/lib/uploaded-photo";

export type EnsuredMedia = {
  id: string;
  url: string;
  alt: string;
  variants: PhotoVariantSpec[];
  optimized: boolean;
};

/**
 * When an editor picks an archive photo, ensure it has the same responsive
 * WebP ladder as a fresh upload. The original file is never replaced — only
 * sibling `-w{N}.webp` files are added from the original pixels.
 */
export async function ensureMediaVariants(mediaAssetId: string): Promise<EnsuredMedia> {
  const db = getDb();
  const [asset] = await db.select().from(mediaAssets).where(eq(mediaAssets.id, mediaAssetId)).limit(1);
  if (!asset) throw new Error("Снимката не е намерена.");
  if (!asset.storageKey) throw new Error("Снимката няма файл в хранилището.");

  const url = libraryImageUrl(asset.storageKey, asset.sourceUrl);
  const [presentation] = await db
    .select()
    .from(mediaPresentations)
    .where(eq(mediaPresentations.mediaAssetId, mediaAssetId))
    .limit(1);
  const existing = Array.isArray(presentation?.variants) ? presentation.variants : [];

  const bytes = await readMediaFile(asset.storageKey);
  if (!bytes?.length) throw new Error("Файлът на снимката липсва в хранилището.");

  // Probe dimensions from disk when the row is incomplete (common for WP import).
  let sourceWidth = asset.width ?? 0;
  let sourceHeight = asset.height ?? 0;
  if (!sourceWidth || !sourceHeight) {
    const probed = await prepareArchiveVariantsFromOriginal(bytes, []);
    sourceWidth = probed.sourceWidth;
    sourceHeight = probed.sourceHeight;
    await db
      .update(mediaAssets)
      .set({ width: sourceWidth, height: sourceHeight })
      .where(eq(mediaAssets.id, mediaAssetId));
  }

  const missing = missingVariantWidths(sourceWidth, existing);
  if (!missing.length) {
    return {
      id: asset.id,
      url,
      alt: asset.alt,
      variants: existing,
      optimized: false,
    };
  }

  const prepared = await prepareArchiveVariantsFromOriginal(bytes, missing);
  const generated: PhotoVariantSpec[] = [];
  await Promise.all(
    prepared.variants.map(async (variant) => {
      const key = variantStorageKey(asset.storageKey!, variant.width);
      await writeMediaFile(key, variant.buffer);
      generated.push({
        url: `/media/${key}`,
        width: variant.width,
        height: variant.height,
      });
    }),
  );

  const variants = mergePresentationVariants(existing, generated, sourceWidth);
  await db
    .insert(mediaPresentations)
    .values({
      mediaAssetId: asset.id,
      variants,
    })
    .onConflictDoUpdate({
      target: mediaPresentations.mediaAssetId,
      set: { variants, updatedAt: new Date() },
    });

  return {
    id: asset.id,
    url,
    alt: asset.alt,
    variants,
    optimized: true,
  };
}
