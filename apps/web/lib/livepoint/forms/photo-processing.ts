import "server-only";
import sharp from "sharp";
import { MAX_PHOTO_BYTES, photoSelectionError } from "./photos";

export const MAX_PHOTO_PIXELS = 50_000_000;
export type PreparedPhoto = { buffer: Buffer; width: number; height: number };

function animatedPng(bytes: Buffer): boolean {
  let offset = 8;
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    if (bytes.toString("ascii", offset + 4, offset + 8) === "acTL") return true;
    offset += length + 12;
  }
  return false;
}

function signature(bytes: Buffer): string | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  if (bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return "png";
  if (bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") return "webp";
  return null;
}

export async function preparePhotos(files: File[]): Promise<PreparedPhoto[]> {
  const error = photoSelectionError(files);
  if (error) throw new Error(error);
  const output: PreparedPhoto[] = [];
  // Sequential decoding bounds native memory and CPU for a five-photo submission.
  for (const file of files) {
    const bytes = Buffer.from(await file.arrayBuffer());
    const format = signature(bytes);
    if (!format || file.type !== `image/${format}`) throw new Error("Съдържанието на файла не съответства на формата на снимката.");
    try {
      const image = sharp(bytes, { failOn: "warning", limitInputPixels: MAX_PHOTO_PIXELS });
      const metadata = await image.metadata();
      if (metadata.format !== format || (metadata.pages ?? 1) !== 1 || (format === "png" && animatedPng(bytes))) throw new Error("invalid image");
      // No keepMetadata/withMetadata: EXIF, GPS, comments and appended payloads are discarded.
      const result = await image.rotate().resize({ width: 4096, height: 4096, fit: "inside", withoutEnlargement: true })
        .webp({ quality: 90, effort: 3 }).timeout({ seconds: 10 }).toBuffer({ resolveWithObject: true });
      if (result.data.length > MAX_PHOTO_BYTES) throw new Error("output too large");
      output.push({ buffer: result.data, width: result.info.width, height: result.info.height });
    } catch {
      throw new Error("Невалидна, повредена, анимирана или прекалено голяма като размери снимка. Изберете статично изображение до 50 мегапиксела.");
    }
  }
  return output;
}
