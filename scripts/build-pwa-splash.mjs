import { createRequire } from "node:module";
import { resolve } from "node:path";
import { mkdir, stat } from "node:fs/promises";

const root = resolve(import.meta.dirname, "..");
const sharp = createRequire(resolve(root, "apps/web/package.json"))("sharp");

const OUT_DIR = resolve(root, "apps/web/public/brand");
const SOURCE = resolve(root, "apps/web/scripts/brand/pwa-launch-logo-source.png");

/**
 * Apple touch startup images at common iOS point sizes. Android launchers
 * compose their own background and use the icon as the splash, so no extra
 * Android-specific image is required.
 *
 * Keep the exact supplied NewsPoint wordmark on white for light/dark. The
 * static OS frame can then hand off to an animated copy of that same artwork.
 */
const SPLASHES = [
  // iPhone SE (2nd/3rd gen), iPhone 8
  { name: "splash-750x1334.png", width: 750, height: 1334 },
  { name: "splash-750x1334-dark.png", width: 750, height: 1334, dark: true },
  { name: "splash-1242x2688.png", width: 1242, height: 2688 },
  { name: "splash-1242x2688-dark.png", width: 1242, height: 2688, dark: true },
  { name: "splash-1170x2532.png", width: 1170, height: 2532 },
  { name: "splash-1170x2532-dark.png", width: 1170, height: 2532, dark: true },
  { name: "splash-1320x2868.png", width: 1320, height: 2868 },
  { name: "splash-1320x2868-dark.png", width: 1320, height: 2868, dark: true },
  { name: "splash-2048x2732.png", width: 2048, height: 2732 },
  { name: "splash-2048x2732-dark.png", width: 2048, height: 2732, dark: true },
];

await mkdir(OUT_DIR, { recursive: true });

// Mobile selects the 1024px image at 3x; smaller displays can take the 512px variant.
for (const width of [512, 1024]) {
  const name = `pwa-launch-logo-${width}.webp`;
  await sharp(SOURCE).resize({ width }).webp({ quality: 87, effort: 6 }).toFile(resolve(OUT_DIR, name));
  const info = await stat(resolve(OUT_DIR, name));
  console.log(`saved ${name} (${(info.size / 1024).toFixed(1)} KB)`);
}

// The decorative light sweep uses only an alpha mask; the visible image stays exact.
const { data, info: pixels } = await sharp(SOURCE).resize({ width: 1024 }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const mask = Buffer.alloc(pixels.width * pixels.height * 4);
for (let p = 0; p < pixels.width * pixels.height; p++) {
  const source = p * 3;
  const target = p * 4;
  const darkest = Math.min(data[source], data[source + 1], data[source + 2]);
  mask[target] = mask[target + 1] = mask[target + 2] = 255;
  mask[target + 3] = Math.round(255 * Math.max(0, Math.min(1, (247 - darkest) / 110)));
}
await sharp(mask, { raw: { width: pixels.width, height: pixels.height, channels: 4 } })
  .webp({ quality: 82, alphaQuality: 95, effort: 6 })
  .toFile(resolve(OUT_DIR, "pwa-launch-logo-mask.webp"));

const darkOnly = process.argv.includes("--dark");

for (const { name, width, height, dark } of SPLASHES) {
  if (darkOnly && !dark) continue;
  const target = resolve(OUT_DIR, name);
  const logo = await sharp(SOURCE).resize({ width: Math.round(width * .84) }).png().toBuffer();
  const { width: logoWidth, height: logoHeight } = await sharp(logo).metadata();
  await sharp({ create: { width, height, channels: 3, background: "#ffffff" } })
    .composite([{ input: logo, left: Math.round((width - logoWidth) / 2), top: Math.round(height * .43 - logoHeight / 2) }])
    .png({ compressionLevel: 9 })
    .toFile(target);

  const info = await stat(target);
  console.log(`saved ${name} (${(info.size / 1024).toFixed(1)} KB, ${width}x${height}, ${dark ? "dark" : "light"})`);
}

console.log("done");
