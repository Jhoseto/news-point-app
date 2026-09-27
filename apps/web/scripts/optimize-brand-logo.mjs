/**
 * Optimize NewsPoint premium logo for /public/brand.
 * Run: pnpm --filter @newspoint/web exec node scripts/optimize-brand-logo.mjs
 */
import { copyFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";

const outDir = join(import.meta.dirname, "../public/brand");
const source = join(import.meta.dirname, "brand/newspoint-logo-source.jpg");

async function knockOutBlack(image) {
  const { data, info } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const threshold = 28;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    if (r <= threshold && g <= threshold && b <= threshold) data[i + 3] = 0;
  }
  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } });
}

const trimmed = sharp(source).rotate().trim({ threshold: 12 });
const cutout = await knockOutBlack(trimmed);
const meta = await cutout.metadata();
const displayWidth = Math.min(1024, meta.width);
const displayHeight = Math.round((meta.height / meta.width) * displayWidth);

const webpOpts = { quality: 88, alphaQuality: 100, effort: 6, smartSubsample: true };

await cutout.clone().resize({ width: displayWidth, withoutEnlargement: true }).webp(webpOpts).toFile(join(outDir, "newspoint-logo.webp"));
await cutout.clone().resize({ width: displayWidth, withoutEnlargement: true }).webp(webpOpts).toFile(join(outDir, "newspoint-logo-dark.webp"));

if (meta.width >= 512) {
  await cutout.clone().resize({ width: 512, withoutEnlargement: true }).webp(webpOpts).toFile(join(outDir, "newspoint-logo-512w.webp"));
}

const manifest = {
  intrinsicWidth: displayWidth,
  intrinsicHeight: displayHeight,
  aspectRatio: Number((displayWidth / displayHeight).toFixed(4)),
  sourceWidth: meta.width,
  sourceHeight: meta.height,
};
await writeFile(join(outDir, "newspoint-logo.manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

const studioBrand = join(import.meta.dirname, "../../studio/public/brand");
for (const name of ["newspoint-logo.webp", "newspoint-logo-512w.webp", "newspoint-logo-dark.webp"]) {
  await copyFile(join(outDir, name), join(studioBrand, name));
}

console.log("OK", manifest);
