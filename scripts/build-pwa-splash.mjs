import { createRequire } from "node:module";
import { resolve } from "node:path";
import { mkdir, stat } from "node:fs/promises";
import { launchPosterSvg } from "./pwa-launch-art.mjs";

const root = resolve(import.meta.dirname, "..");
const sharp = createRequire(resolve(root, "apps/web/package.json"))("sharp");

const OUT_DIR = resolve(root, "apps/web/public/brand");

/**
 * Apple touch startup images at common iOS point sizes. Android launchers
 * compose their own background and use the icon as the splash, so no extra
 * Android-specific image is required.
 *
 * Keep the OS frame identical for light/dark so it can pass to the web animation
 * without a black flash. The browser then reveals the actual app theme.
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

const darkOnly = process.argv.includes("--dark");

for (const { name, width, height, dark } of SPLASHES) {
  if (darkOnly && !dark) continue;
  const target = resolve(OUT_DIR, name);
  await sharp(launchPosterSvg(width, height)).png({ compressionLevel: 9 }).toFile(target);

  const info = await stat(target);
  console.log(`saved ${name} (${(info.size / 1024).toFixed(1)} KB, ${width}x${height}, ${dark ? "dark" : "light"})`);
}

console.log("done");
