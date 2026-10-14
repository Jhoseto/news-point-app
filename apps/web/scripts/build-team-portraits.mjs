import { createHash } from "node:crypto";
import { readFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";

// Input: approved, transparent cutouts; no background removal happens here.
const sourceDir = process.argv[2];
if (!sourceDir) throw new Error("Usage: node build-team-portraits.mjs <cutout-directory>");
const outputDir = resolve(import.meta.dirname, "../public/brand");
await mkdir(outputDir, { recursive: true });

for (const name of ["atanas", "stanimir", "petar", "nikolai"]) {
  const input = await readFile(resolve(sourceDir, `${name}.png`));
  const metadata = await sharp(input).metadata();
  if (!metadata.hasAlpha) throw new Error(`${name}: portrait must have transparency`);
  const stats = await sharp(input).stats();
  if (stats.channels[3]?.min !== 0 || stats.channels[3]?.max !== 255) {
    throw new Error(`${name}: expected transparent background and opaque subject`);
  }
  const hash = createHash("sha256").update(input).digest("hex").slice(0, 8);
  for (const width of [800, 1120]) {
    const filename = `team-${name}-cutout-${width}-${hash}.webp`;
    await sharp(input).resize(width, width * 5 / 4, { fit: "cover" })
      .webp({ quality: 88, alphaQuality: 100, effort: 6 })
      .toFile(resolve(outputDir, filename));
    console.log(`/brand/${filename}`);
  }
}
