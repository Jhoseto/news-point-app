import "server-only";
import { createHash } from "node:crypto";
import sharp from "sharp";
import type { PreparedPhoto } from "../livepoint/forms/photo-processing";

export const PUBLIC_PHOTO_WIDTHS = [320, 640, 960, 1440, 1920] as const;
export const PUBLIC_PHOTO_QUALITY = 83;
export type PublicPhotoVariant = PreparedPhoto & { fileName: string; bytes: number; contentType: "image/webp" };

/** Publication-time preparation only. The caller must approve and publish separately. */
export async function preparePublicPhotoVariants(master: PreparedPhoto): Promise<PublicPhotoVariant[]> {
  if (master.buffer.length > 10 * 1024 * 1024) throw new Error("Invalid clean master");
  const image = sharp(master.buffer, { failOn: "warning", limitInputPixels: 50_000_000 });
  const metadata = await image.metadata();
  if (metadata.format !== "webp" || (metadata.pages ?? 1) !== 1
    || metadata.width !== master.width || metadata.height !== master.height
    || master.width > 4096 || master.height > 4096) throw new Error("Invalid clean master");
  const widths = [...new Set(PUBLIC_PHOTO_WIDTHS.map(width => Math.min(width, master.width)))];
  const output: PublicPhotoVariant[] = [];
  for (const width of widths) {
    const result = await image.clone().resize({ width, withoutEnlargement: true })
      .webp({ quality: PUBLIC_PHOTO_QUALITY, effort: 4 }).timeout({ seconds: 10 }).toBuffer({ resolveWithObject: true });
    const hash = createHash("sha256").update(result.data).digest("hex");
    output.push({ buffer: result.data, width: result.info.width, height: result.info.height,
      bytes: result.data.length, fileName: `${hash}.webp`, contentType: "image/webp" });
  }
  return output;
}
