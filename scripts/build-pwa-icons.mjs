import { createRequire } from "node:module";
import { resolve } from "node:path";
import { mkdir, stat } from "node:fs/promises";
import { launchMarkSvg } from "./pwa-launch-art.mjs";

const root = resolve(import.meta.dirname, "..");
const sharp = createRequire(resolve(root, "apps/web/package.json"))("sharp");

const LIGHT_SOURCE = resolve(root, "apps/web/scripts/brand/newspoint-logo-source.png");
const OUT_DIR = resolve(root, "apps/web/public/brand");

/** Crop the left emblem from the premium wordmark (same rings as the new logo). */
async function emblemBuffer(source) {
  const rotated = sharp(source).rotate();
  const meta = await rotated.metadata();
  const cropW = Math.min(Math.round(meta.width * 0.26), meta.width);
  const cropped = await rotated.extract({ left: 0, top: 0, width: cropW, height: meta.height }).png().toBuffer();
  return sharp(cropped).trim({ threshold: 8 }).png().toBuffer();
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
const emblem = await emblemBuffer(LIGHT_SOURCE);

for (const { name, size, maskable } of SIZES) {
  const target = resolve(OUT_DIR, name);
  if (name.startsWith("icon-") || name.startsWith("apple-touch-icon")) {
    await sharp(launchMarkSvg(size, maskable)).png({ compressionLevel: 9 }).toFile(target);
    const info = await stat(target);
    console.log(`saved ${name} (${(info.size / 1024).toFixed(1)} KB)`);
    continue;
  }
  if (!maskable) {
    await sharp(emblem)
      .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png({ compressionLevel: 9, palette: size <= 32 })
      .toFile(target);
  } else {
    const finalSize = Math.round(size * 1.4);
    const mark = await sharp(emblem)
      .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
    await sharp({
      create: { width: finalSize, height: finalSize, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .composite([{ input: mark, top: Math.round((finalSize - size) / 2), left: Math.round((finalSize - size) / 2) }])
      .png({ compressionLevel: 9 })
      .toFile(target);
  }
  const info = await stat(target);
  console.log(`saved ${name} (${(info.size / 1024).toFixed(1)} KB)`);
}

console.log("done");
