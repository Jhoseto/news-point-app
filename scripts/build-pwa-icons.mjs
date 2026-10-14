import { createRequire } from "node:module";
import { resolve, join } from "node:path";
import { copyFile, mkdir, stat } from "node:fs/promises";

const root = resolve(import.meta.dirname, "..");
const sharp = createRequire(resolve(root, "apps/web/package.json"))("sharp");

const EMBLEM_SOURCE = resolve(root, "apps/web/scripts/brand/emblem-favicon-source.png");
const OUT_DIR = resolve(root, "apps/web/public/brand");
const STUDIO_BRAND = resolve(root, "apps/studio/public/brand");

/** Koce emblem: circular rings on white (source PNG). */
async function emblemPng() {
  return sharp(EMBLEM_SOURCE).rotate().trim({ threshold: 10 }).png().toBuffer();
}

/** White square canvas with the emblem centered (site favicon / PWA / studio tile). */
async function squareEmblemPipeline(emblem, size, { maskable = false } = {}) {
  const inner = Math.round(size * (maskable ? 0.78 : 0.92));
  const mark = await sharp(emblem).resize(inner, inner, { fit: "contain", background: "#ffffff" }).png().toBuffer();
  const meta = await sharp(mark).metadata();
  return sharp({ create: { width: size, height: size, channels: 3, background: "#ffffff" } }).composite([
    { input: mark, left: Math.round((size - meta.width) / 2), top: Math.round((size - meta.height) / 2) },
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
const emblem = await emblemPng();

for (const { name, size, maskable } of SIZES) {
  const target = resolve(OUT_DIR, name);
  const image = await squareEmblemPipeline(emblem, size, { maskable });
  const pngOpts = { compressionLevel: 9, ...(size <= 32 ? { palette: true } : {}) };
  await image.png(pngOpts).toFile(target);
  const info = await stat(target);
  console.log(`saved ${name} (${(info.size / 1024).toFixed(1)} KB)`);
}

await (await squareEmblemPipeline(emblem, 512)).webp({ quality: 92 }).toFile(join(OUT_DIR, "studio-mark-512w.webp"));
await (await squareEmblemPipeline(emblem, 256)).webp({ quality: 92 }).toFile(join(OUT_DIR, "studio-mark.webp"));

for (const name of ["studio-mark.webp", "studio-mark-512w.webp", "favicon-16.png", "favicon-32.png"]) {
  await copyFile(join(OUT_DIR, name), join(STUDIO_BRAND, name));
}

console.log("done");
