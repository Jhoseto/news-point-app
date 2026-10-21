/**
 * Crop the approved site share banner to Open Graph 1200×630 (JPEG + WebP).
 * Source: scripts/brand/og-site-share-source.jpg
 * Run: pnpm --filter @newspoint/web exec node scripts/optimize-og-site-share.mjs
 */
import { statSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

const root = import.meta.dirname;
const source = join(root, "brand/og-site-share-source.jpg");
const outDir = join(root, "../public/share");
const jpegPath = join(outDir, "og-site-1200x630.jpg");
const webpPath = join(outDir, "og-site-1200x630.webp");

const base = sharp(source).rotate().resize(1200, 630, { fit: "cover", position: "centre" });
await base.clone().jpeg({ quality: 84, progressive: true, mozjpeg: true }).toFile(jpegPath);
await base.clone().webp({ quality: 82, effort: 6 }).toFile(webpPath);

for (const file of [jpegPath, webpPath]) {
  const meta = await sharp(file).metadata();
  if (meta.width !== 1200 || meta.height !== 630) throw new Error(`Unexpected dimensions: ${file}`);
}
if (statSync(jpegPath).size > 300_000) throw new Error("JPEG OG exceeds 300 KiB — recompress.");
console.log("og-site", { jpeg: statSync(jpegPath).size, webp: statSync(webpPath).size });
