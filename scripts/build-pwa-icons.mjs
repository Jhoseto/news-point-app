import { createRequire } from "node:module";
import { resolve } from "node:path";
import { writeFile, mkdir, stat } from "node:fs/promises";
import { resolve as pathResolve } from "node:path";

const root = pathResolve(import.meta.dirname, "..");
const sharp = createRequire(resolve(root, "apps/web/package.json"))("sharp");

const SOURCE = resolve(root, "apps/web/public/brand/mark.svg");
const OUT_DIR = resolve(root, "apps/web/public/brand");

/**
 * Generate the PWA home-screen icon set from the brand mark.
 *
 *  - Standard Android + Web manifest: 192, 512.
 *  - Android maskable (safe-zone icon, 40% padding around the visible content
 *    so OS-driven rounding/clipping never crops the rings): 512 maskable.
 *  - Apple touch icons at the iOS points used by the OS:
 *      120 (iPhone @2x), 152 (iPad @2x), 167 (iPad Pro), 180 (iPhone @3x).
 *  - Browser favicons at 32 and 16.
 *
 * The maskable variant inlines the same SVG into a transparent canvas 40% larger
 * than the artwork so the OS can crop freely without losing the rings.
 */
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

const SOURCE_SVG = await import("node:fs/promises").then((fs) => fs.readFile(SOURCE, "utf8"));

await mkdir(OUT_DIR, { recursive: true });

for (const { name, size, maskable } of SIZES) {
  const finalSize = maskable ? Math.round(size * 1.4) : size;
  const target = resolve(OUT_DIR, name);

  if (!maskable) {
    await sharp(Buffer.from(SOURCE_SVG))
      .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png({ compressionLevel: 9 })
      .toFile(target);
  } else {
    // Place the 512px mark in the middle of a 717×717 transparent canvas so the OS
    // can crop up to 40% (per the maskable spec) without losing the artwork.
    const mark = await sharp(Buffer.from(SOURCE_SVG))
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