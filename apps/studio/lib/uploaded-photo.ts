import sharp from "sharp";

export const UPLOADED_PHOTO_MAX_BYTES = 25 * 1024 * 1024;

/** Same preparation as a photo attached to a news article. */
export async function prepareUploadedPhoto(bytes: Buffer): Promise<{ buffer: Buffer; width: number; height: number }> {
  const image = sharp(bytes, { limitInputPixels: 60_000_000 });
  const metadata = await image.metadata();
  if (!metadata.width || !metadata.height) throw new Error("Невалидна снимка.");
  const buffer = await image.rotate().resize({ width: 4096, height: 4096, fit: "inside", withoutEnlargement: true }).webp({ quality: 84 }).toBuffer();
  return { buffer, width: Math.min(metadata.width, 4096), height: Math.min(metadata.height, 4096) };
}
