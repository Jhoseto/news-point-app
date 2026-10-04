import sharp from "sharp";

export const UPLOADED_PHOTO_MAX_BYTES = 25 * 1024 * 1024;

/**
 * Width ladder for responsive variants. The reader picks the smallest that
 * still clears the CSS `sizes` slot, so a 52 px mobile thumb never pulls
 * the original 4096 px JPEG. The pipeline keeps the full-size webp too so
 * the lead card on a desktop can still upscale beyond 1920.
 *
 * The first rung (320) clears the largest mobile slot (the lead image
 * card on a 390 px viewport with DPR 2 ≈ 780 device px). The remaining
 * rungs match common breakpoints so each variant clears one device class.
 */
export const UPLOADED_PHOTO_VARIANT_WIDTHS = [320, 480, 768, 1024, 1440, 1920] as const;

export type UploadedPhotoVariant = {
  width: number;
  height: number;
  buffer: Buffer;
};

export type PreparedUploadedPhoto = {
  /** Original-quality webp (≤4096 px), used by the hero on a desktop. */
  full: { buffer: Buffer; width: number; height: number };
  /** Smaller webp variants for phones, tablets and smaller desktop slots. */
  variants: UploadedPhotoVariant[];
};

/** Same preparation as a photo attached to a news article. */
export async function prepareUploadedPhoto(bytes: Buffer): Promise<{ buffer: Buffer; width: number; height: number }> {
  const prepared = await prepareUploadedPhotoWithVariants(bytes);
  return prepared.full;
}

/**
 * Re-encode the upload as webp and emit a width ladder so the reader
 * serves the smallest variant that clears its `sizes` slot. The EXIF is
 * stripped on the way in (`rotate()` is called only to honour the EXIF
 * orientation flag).
 */
export async function prepareUploadedPhotoWithVariants(bytes: Buffer): Promise<PreparedUploadedPhoto> {
  const source = sharp(bytes, { limitInputPixels: 60_000_000 });
  const metadata = await source.metadata();
  if (!metadata.width || !metadata.height) throw new Error("Невалидна снимка.");
  const aspect = metadata.width / metadata.height;

  const fullWidth = Math.min(metadata.width, 4096);
  const rotated = source.rotate().resize({
    width: fullWidth,
    fit: "inside",
    withoutEnlargement: true,
  });
  const fullBuffer = await rotated.webp({ quality: 84 }).toBuffer();
  // Re-read the actual buffer dimensions to avoid sharp's internal rounding
  // (explicit height + width can drift by a pixel); the aspect ratio is
  // preserved by `fit: "inside"`.
  const fullMeta = await sharp(fullBuffer).metadata();
  const fullHeight = fullMeta.height ?? Math.round(fullWidth / aspect);

  const variants: UploadedPhotoVariant[] = [];
  for (const targetWidth of UPLOADED_PHOTO_VARIANT_WIDTHS) {
    if (targetWidth >= fullWidth) continue;
    const variantHeight = Math.round(targetWidth / aspect);
    const buffer = await sharp(fullBuffer)
      .resize({ width: targetWidth, fit: "inside" })
      .webp({ quality: 78 })
      .toBuffer();
    variants.push({ width: targetWidth, height: variantHeight, buffer });
  }

  return {
    full: { buffer: fullBuffer, width: fullWidth, height: fullHeight },
    variants,
  };
}