import sharp, { type Sharp } from "sharp";

export const UPLOADED_PHOTO_MAX_BYTES = 25 * 1024 * 1024;

/**
 * Width ladder for responsive variants. The reader picks the smallest that
 * still clears the CSS `sizes` slot, so a 52 px mobile thumb never pulls
 * the original 4096 px JPEG. The pipeline keeps the full-size file too so
 * the lead card on a desktop can still upscale beyond 1920.
 */
export const UPLOADED_PHOTO_VARIANT_WIDTHS = [320, 480, 768, 1024, 1440, 1920] as const;

/** Encode quality for master and ladder — variants are derived from the
 * original bytes, not from an already-lossy WebP master. */
export const UPLOADED_PHOTO_WEBP_QUALITY = 84;

export type UploadedPhotoVariant = {
  width: number;
  height: number;
  buffer: Buffer;
};

export type PreparedUploadedPhoto = {
  /** High-quality webp (≤4096 px), used by the hero on a desktop. */
  full: { buffer: Buffer; width: number; height: number };
  /** Smaller webp variants for phones, tablets and smaller desktop slots. */
  variants: UploadedPhotoVariant[];
};

export type PhotoVariantSpec = { width: number; height: number; url: string };

/** Ladder widths strictly below the source width. */
export function neededVariantWidths(sourceWidth: number): number[] {
  return UPLOADED_PHOTO_VARIANT_WIDTHS.filter((width) => width < sourceWidth);
}

/** Widths from the ladder that are missing from an existing presentation (±16 px). */
export function missingVariantWidths(
  sourceWidth: number,
  existing: ReadonlyArray<{ width: number }>,
): number[] {
  return neededVariantWidths(sourceWidth).filter(
    (width) => !existing.some((entry) => Math.abs(entry.width - width) <= 16),
  );
}

/** Same preparation as a photo attached to a news article. */
export async function prepareUploadedPhoto(bytes: Buffer): Promise<{ buffer: Buffer; width: number; height: number }> {
  const prepared = await prepareUploadedPhotoWithVariants(bytes);
  return prepared.full;
}

/**
 * Re-encode the upload as webp and emit a width ladder. Variants are resized
 * from the original (rotated) pixels — never from the already-compressed master —
 * so quality does not drop twice. EXIF is stripped (`rotate()` honours orientation).
 */
export async function prepareUploadedPhotoWithVariants(bytes: Buffer): Promise<PreparedUploadedPhoto> {
  const pipeline = sharp(bytes, { limitInputPixels: 60_000_000 }).rotate();
  const metadata = await pipeline.metadata();
  if (!metadata.width || !metadata.height) throw new Error("Невалидна снимка.");
  const aspect = metadata.width / metadata.height;

  const fullWidth = Math.min(metadata.width, 4096);
  const fullBuffer = await pipeline
    .clone()
    .resize({
      width: fullWidth,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: UPLOADED_PHOTO_WEBP_QUALITY })
    .toBuffer();
  const fullMeta = await sharp(fullBuffer).metadata();
  const fullHeight = fullMeta.height ?? Math.round(fullWidth / aspect);

  const variants = await encodeLadderFromPipeline(pipeline, fullWidth, aspect);
  return {
    full: { buffer: fullBuffer, width: fullWidth, height: fullHeight },
    variants,
  };
}

/**
 * Build only the responsive ladder from existing archive bytes. Does not replace
 * the original file — callers keep `storage_key` and append `-w{N}.webp` siblings.
 */
export async function prepareArchiveVariantsFromOriginal(
  bytes: Buffer,
  onlyWidths?: ReadonlyArray<number>,
): Promise<{ sourceWidth: number; sourceHeight: number; variants: UploadedPhotoVariant[] }> {
  const pipeline = sharp(bytes, { limitInputPixels: 60_000_000 }).rotate();
  const metadata = await pipeline.metadata();
  if (!metadata.width || !metadata.height) throw new Error("Невалидна снимка.");
  const aspect = metadata.width / metadata.height;
  const sourceWidth = metadata.width;
  const sourceHeight = metadata.height;
  // `undefined` → full ladder; explicit `[]` → size probe only (no encodes).
  const targets = onlyWidths
    ? onlyWidths.filter((width) => width < sourceWidth)
    : neededVariantWidths(sourceWidth);
  const variants: UploadedPhotoVariant[] = [];
  for (const targetWidth of targets) {
    const variantHeight = Math.round(targetWidth / aspect);
    const buffer = await pipeline
      .clone()
      .resize({ width: targetWidth, fit: "inside", withoutEnlargement: true })
      .webp({ quality: UPLOADED_PHOTO_WEBP_QUALITY })
      .toBuffer();
    const meta = await sharp(buffer).metadata();
    variants.push({
      width: meta.width ?? targetWidth,
      height: meta.height ?? variantHeight,
      buffer,
    });
  }
  return { sourceWidth, sourceHeight, variants };
}

async function encodeLadderFromPipeline(
  pipeline: Sharp,
  fullWidth: number,
  aspect: number,
): Promise<UploadedPhotoVariant[]> {
  const variants: UploadedPhotoVariant[] = [];
  for (const targetWidth of neededVariantWidths(fullWidth)) {
    const variantHeight = Math.round(targetWidth / aspect);
    const buffer = await pipeline
      .clone()
      .resize({ width: targetWidth, fit: "inside", withoutEnlargement: true })
      .webp({ quality: UPLOADED_PHOTO_WEBP_QUALITY })
      .toBuffer();
    const meta = await sharp(buffer).metadata();
    variants.push({
      width: meta.width ?? targetWidth,
      height: meta.height ?? variantHeight,
      buffer,
    });
  }
  return variants;
}

/** Sibling key next to the archive original, e.g. `news/2024/03/foo-w768.webp`. */
export function variantStorageKey(storageKey: string, width: number): string {
  const slash = storageKey.lastIndexOf("/");
  const dir = slash >= 0 ? storageKey.slice(0, slash + 1) : "";
  const file = slash >= 0 ? storageKey.slice(slash + 1) : storageKey;
  const base = file.replace(/\.[^.]+$/i, "").replace(/-w\d+$/i, "");
  return `${dir}${base}-w${width}.webp`;
}

/** Merge existing presentation rows with a fresh ladder; keep at most 6 entries. */
export function mergePresentationVariants(
  existing: ReadonlyArray<PhotoVariantSpec>,
  generated: ReadonlyArray<PhotoVariantSpec>,
  sourceWidth: number,
): PhotoVariantSpec[] {
  const byWidth = new Map<number, PhotoVariantSpec>();
  for (const entry of existing) {
    if (entry.width > 0 && entry.width < sourceWidth) byWidth.set(entry.width, entry);
  }
  for (const entry of generated) {
    byWidth.set(entry.width, entry);
  }
  // Prefer the standard ladder order; drop extras beyond the DB max of 6.
  const preferred = neededVariantWidths(sourceWidth);
  const ordered: PhotoVariantSpec[] = [];
  for (const width of preferred) {
    const hit = [...byWidth.entries()].find(([w]) => Math.abs(w - width) <= 16);
    if (hit) {
      ordered.push(hit[1]);
      byWidth.delete(hit[0]);
    }
  }
  for (const entry of [...byWidth.values()].sort((a, b) => a.width - b.width)) {
    if (ordered.length >= 6) break;
    ordered.push(entry);
  }
  return ordered.slice(0, 6);
}
