/**
 * Optimize NewsPoint premium logo for /public/brand.
 * Run: pnpm --filter @newspoint/web exec node scripts/optimize-brand-logo.mjs
 */
import { access, copyFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";

const outDir = join(import.meta.dirname, "../public/brand");
const brandDir = join(import.meta.dirname, "brand");
const pngSource = join(brandDir, "newspoint-logo-source.png");
const jpgSource = join(brandDir, "newspoint-logo-source.jpg");
let source = jpgSource;
try {
  await access(pngSource);
  source = pngSource;
} catch {
  /* jpg fallback */
}

/** Transparent background with soft edges so glows stay smooth in WebP. */
async function knockOutBlack(image) {
  const { data, info } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const hard = 24;
  const soft = 48;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const peak = Math.max(r, g, b);
    if (peak <= hard) data[i + 3] = 0;
    else if (peak <= soft) {
      const t = (peak - hard) / (soft - hard);
      data[i + 3] = Math.round(data[i + 3] * t);
    }
  }
  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } });
}

const trimmed = sharp(source).rotate().trim({ threshold: 12 });
const cutout = await knockOutBlack(trimmed);
const meta = await cutout.metadata();
const displayWidth = Math.min(1024, meta.width);
const displayHeight = Math.round((meta.height / meta.width) * displayWidth);

const webpOpts = { quality: 92, alphaQuality: 100, effort: 6, smartSubsample: false, nearLossless: false };

await cutout.clone().resize({ width: displayWidth, withoutEnlargement: true }).webp(webpOpts).toFile(join(outDir, "newspoint-logo.webp"));

if (meta.width >= 512) {
  await cutout.clone().resize({ width: 512, withoutEnlargement: true }).webp(webpOpts).toFile(join(outDir, "newspoint-logo-512w.webp"));
}

const darkSource = join(brandDir, "newspoint-logo-dark-source.png");
let darkManifest = null;
try {
  await access(darkSource);
  const darkTrimmed = sharp(darkSource).rotate().trim({ threshold: 12 });
  const darkCutout = await knockOutBlack(darkTrimmed);
  const darkMeta = await darkCutout.metadata();
  const darkWidth = Math.min(1024, darkMeta.width);
  const darkHeight = Math.round((darkMeta.height / darkMeta.width) * darkWidth);
  await darkCutout.clone().resize({ width: darkWidth, withoutEnlargement: true }).webp(webpOpts).toFile(join(outDir, "newspoint-logo-dark.webp"));
  if (darkMeta.width >= 512) {
    await darkCutout.clone().resize({ width: 512, withoutEnlargement: true }).webp(webpOpts).toFile(join(outDir, "newspoint-logo-dark-512w.webp"));
  }
  darkManifest = { intrinsicWidth: darkWidth, intrinsicHeight: darkHeight, sourceWidth: darkMeta.width, sourceHeight: darkMeta.height };
} catch {
  await cutout.clone().resize({ width: displayWidth, withoutEnlargement: true }).webp(webpOpts).toFile(join(outDir, "newspoint-logo-dark.webp"));
}

const manifest = {
  intrinsicWidth: displayWidth,
  intrinsicHeight: displayHeight,
  aspectRatio: Number((displayWidth / displayHeight).toFixed(4)),
  sourceWidth: meta.width,
  sourceHeight: meta.height,
  ...(darkManifest ? { dark: darkManifest } : {}),
};
await writeFile(join(outDir, "newspoint-logo.manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

const studioBrand = join(import.meta.dirname, "../../studio/public/brand");
for (const name of ["newspoint-logo.webp", "newspoint-logo-512w.webp", "newspoint-logo-dark.webp", "newspoint-logo-dark-512w.webp"]) {
  await copyFile(join(outDir, name), join(studioBrand, name));
}

console.log("OK", manifest);
