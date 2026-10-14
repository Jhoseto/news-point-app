import { createRequire } from "node:module";
import { resolve, join } from "node:path";
import { copyFile, mkdir, stat } from "node:fs/promises";

const root = resolve(import.meta.dirname, "..");
const sharp = createRequire(resolve(root, "apps/web/package.json"))("sharp");

/** Vector rings only — no white plate (unlike the small PNG export). */
const MARK_SVG = resolve(root, "apps/web/public/brand/mark.svg");
const OUT_DIR = resolve(root, "apps/web/public/brand");
const STUDIO_BRAND = resolve(root, "apps/studio/public/brand");

const SVG_DENSITY = 512;

async function markRaster(size) {
  return sharp(MARK_SVG, { density: SVG_DENSITY }).resize(size, size, { fit: "fill" }).ensureAlpha().png().toBuffer();
}

function circleMask(size) {
  const r = size / 2;
  return Buffer.from(
    `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg"><circle cx="${r}" cy="${r}" r="${r}" fill="#fff"/></svg>`,
  );
}

/** Public site: rings scaled to the circle edge; white only in square corners outside the clip. */
async function circularMarkPipeline(size, { maskable = false } = {}) {
  const bleed = maskable ? 0.82 : 1.06;
  const render = Math.max(size, Math.round(size * bleed));
  const mark = await markRaster(render);
  const left = Math.round((render - size) / 2);
  const cropped =
    render === size
      ? mark
      : await sharp(mark)
          .extract({ left, top: left, width: size, height: size })
          .png()
          .toBuffer();
  return sharp(cropped)
    .composite([{ input: circleMask(size), blend: "dest-in" }])
    .flatten({ background: "#ffffff" });
}

/** Studio: square white tile, rings nearly full-bleed. */
async function squareMarkPipeline(size, { maskable = false } = {}) {
  const inner = Math.round(size * (maskable ? 0.78 : 0.96));
  const mark = await markRaster(inner);
  return sharp({ create: { width: size, height: size, channels: 3, background: "#ffffff" } }).composite([
    { input: mark, left: Math.round((size - inner) / 2), top: Math.round((size - inner) / 2) },
  ]);
}

const SIZES = [
  { name: "icon-192.png", size: 192, maskable: false },
  { name: "icon-512.png", size: 512, maskable: false },
  { name: "icon-maskable-512.png", size: 512, maskable: true },
  { name: "apple-touch-icon.png", size: 180, maskable: false },
  { name: "apple-touch-icon-120.png", size: 120, maskable: false },
  { name: "apple-touch-icon-152.png", size: 152, maskable: false },
  { name: "apple-touch-icon-167.png", size: 167, maskable: false },
  { name: "favicon-32.png", size: 32, maskable: false },
  { name: "favicon-16.png", size: 16, maskable: false },
];

await mkdir(OUT_DIR, { recursive: true });
await mkdir(STUDIO_BRAND, { recursive: true });

for (const { name, size, maskable } of SIZES) {
  const target = resolve(OUT_DIR, name);
  const image = await circularMarkPipeline(size, { maskable });
  const pngOpts = { compressionLevel: 9, ...(size <= 32 ? { palette: true } : {}) };
  await image.png(pngOpts).toFile(target);
  const info = await stat(target);
  console.log(`saved ${name} (${(info.size / 1024).toFixed(1)} KB)`);
}

await (await squareMarkPipeline(512)).webp({ quality: 92 }).toFile(join(OUT_DIR, "studio-mark-512w.webp"));
await (await squareMarkPipeline(256)).webp({ quality: 92 }).toFile(join(OUT_DIR, "studio-mark.webp"));

const STUDIO_ICON = join(root, "apps/studio/app/icon.png");
for (const { size, name } of [
  { size: 32, name: "favicon-32.png" },
  { size: 16, name: "favicon-16.png" },
  { size: 180, name: "apple-touch-icon.png" },
]) {
  const pngOpts = { compressionLevel: 9, ...(size <= 32 ? { palette: true } : {}) };
  const target = join(STUDIO_BRAND, name);
  await (await squareMarkPipeline(size)).png(pngOpts).toFile(target);
  console.log(`saved studio/${name}`);
}
for (const name of ["studio-mark.webp", "studio-mark-512w.webp"]) {
  await copyFile(join(OUT_DIR, name), join(STUDIO_BRAND, name));
}
await (await squareMarkPipeline(32)).png({ compressionLevel: 9, palette: true }).toFile(STUDIO_ICON);

console.log("done");
