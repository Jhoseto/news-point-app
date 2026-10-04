import { createRequire } from "node:module";
import { resolve } from "node:path";
import { mkdir, stat } from "node:fs/promises";

const root = resolve(import.meta.dirname, "..");
const sharp = createRequire(resolve(root, "apps/web/package.json"))("sharp");

const LOGO = resolve(root, "apps/web/public/brand/newspoint-logo.webp");
const OUT_DIR = resolve(root, "apps/web/public/brand");
const LIGHT_BG = { r: 255, g: 255, b: 255, alpha: 1 };
const DARK_BG = { r: 5, g: 11, b: 34, alpha: 1 };

/**
 * Apple touch startup images at common iOS point sizes. Android launchers
 * compose their own background and use the icon as the splash, so no extra
 * Android-specific image is required.
 *
 * The full NewsPoint logo (rings + wordmark + slogan) is centered on a solid
 * background. The iOS system fades this out as the app renders the first
 * frame, so the splash must match the actual app theme (light/dark).
 */
const SPLASHES = [
  // iPhone SE (2nd/3rd gen), iPhone 8
  { name: "splash-750x1334.png", width: 750, height: 1334 },
  // iPhone 11 Pro Max, iPhone 13 Pro Max, iPhone 14 Plus / 15 Plus / 16 Plus
  { name: "splash-1242x2688.png", width: 1242, height: 2688 },
  // iPhone 14 Pro / 15 Pro / 16 Pro and similar — most common modern iPhone
  { name: "splash-1170x2532.png", width: 1170, height: 2532 },
  { name: "splash-1170x2532-dark.png", width: 1170, height: 2532, dark: true },
  // iPhone 16 Pro Max
  { name: "splash-1320x2868.png", width: 1320, height: 2868 },
  { name: "splash-1320x2868-dark.png", width: 1320, height: 2868, dark: true },
  // iPad Pro 12.9" portrait
  { name: "splash-2048x2732.png", width: 2048, height: 2732 },
];

await mkdir(OUT_DIR, { recursive: true });

// Pre-scale the logo so the largest splash can reuse the same buffer.
const MAX_W = Math.max(...SPLASHES.map((s) => s.width));
const logoBuf = await sharp(LOGO)
  .resize({ width: Math.round(MAX_W * 0.6), withoutEnlargement: false })
  .png()
  .toBuffer();

for (const { name, width, height, dark } of SPLASHES) {
  const target = resolve(OUT_DIR, name);
  const bg = dark ? DARK_BG : LIGHT_BG;
  const fg = dark ? { r: 199, g: 207, b: 219, alpha: 1 } : { r: 47, g: 61, b: 105, alpha: 1 };

  const canvas = sharp({
    create: { width, height, channels: 4, background: bg },
  });

  // Compose the centered logo (sized to 50% of width) over the background.
  const logoWidth = Math.round(width * 0.5);
  const left = Math.round((width - logoWidth) / 2);
  const top = Math.round(height * 0.42);

  const out = await sharp(LOGO)
    .resize({ width: logoWidth, withoutEnlargement: false })
    .composite([
      // The wordmark already includes its own sub-tagline; we just keep it as-is.
    ])
    .png()
    .toBuffer();

  await canvas
    .composite([{ input: out, top, left }])
    .png({ compressionLevel: 9 })
    .toFile(target);

  const info = await stat(target);
  console.log(`saved ${name} (${(info.size / 1024).toFixed(1)} KB, ${width}x${height}, ${dark ? "dark" : "light"})`);
}

console.log("done");