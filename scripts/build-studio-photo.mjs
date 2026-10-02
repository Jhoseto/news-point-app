#!/usr/bin/env node
// Builds the NewsPodcast theatre background once, by hand, and generates the module the page reads.
//
//   node scripts/build-studio-photo.mjs [source-image]
//
// Quality is the contract: the encoder settings below are deliberately high and are never
// lowered to hit a byte budget. If a variant comes out larger than STUDIO_PHOTO_BUDGET the
// script warns and exits non-zero; it does not re-encode anything. The decision is a human's:
// fewer widths, or accept the size.
//
// The savings come from elsewhere: `Cache-Control: immutable` in next.config.ts makes repeat
// visits cost zero bytes, and `srcset` keeps the large file off small screens.
import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const brandDir = resolve(root, "apps/web/public/brand");
const modulePath = resolve(root, "apps/web/components/podcast/studio-photo.ts");

// sharp is a dependency of apps/web, not of the workspace root, so resolve it from there.
const sharp = createRequire(resolve(root, "apps/web/package.json"))("sharp");

/** Widest variant is the 1915px source. Narrower variants exist only to feed smaller screens. */
const WIDTHS = [800, 1280, 1600, 1915];

/** The smallest single file allowed to cross the line before the script stops and asks. */
const STUDIO_PHOTO_BUDGET = 250 * 1024;

const DEFAULT_SOURCE =
  "C:/Users/konst/.minimax/v2/assets/2026/09/30/16-38-29-868-asset_20260930-163829-868_83bcc6bf2fbe_44ec8558-Office5.png";

/** High on purpose. This image carries neon edges, glass and fine foliage; it shows artefacts early. */
const ENCODERS = {
  avif: { extension: "avif", type: "image/avif", run: (p) => p.avif({ quality: 72, effort: 9 }) },
  webp: { extension: "webp", type: "image/webp", run: (p) => p.webp({ quality: 90, effort: 6, smartSubsample: true }) },
  jpeg: {
    extension: "jpg",
    type: "image/jpeg",
    // 4:4:4, not 4:2:0: chroma subsampling smears the saturated neon and the logo lettering.
    run: (p) => p.jpeg({ quality: 92, mozjpeg: true, progressive: true, chromaSubsampling: "4:4:4" }),
  },
};

const LQIP = { width: 32, quality: 40 };

const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;

async function main() {
  const source = resolve(process.argv[2] ?? DEFAULT_SOURCE);
  const input = await readFile(source);
  const metadata = await sharp(input, { limitInputPixels: 60_000_000 }).metadata();
  if (!metadata.width || !metadata.height) throw new Error("Изходната снимка не е валидна.");

  const hash = createHash("sha256").update(input).digest("hex").slice(0, 8);
  const widths = WIDTHS.filter((width) => width <= metadata.width);
  if (!widths.includes(metadata.width) && metadata.width < WIDTHS.at(-1)) {
    console.log(`Източникът е ${metadata.width}px — по-тесен от последния вариант.`);
  }

  await mkdir(brandDir, { recursive: true });

  // The previous 1462/768 pair is replaced wholesale; leaving it would keep stale bytes on disk.
  for (const name of await readdir(brandDir)) {
    if (/^podcast-studio-(1462|768)\.webp$/.test(name)) {
      await rm(resolve(brandDir, name));
      console.log(`премахнат стар вариант: ${name}`);
    }
  }

  const rows = [];
  const written = {};
  for (const format of Object.keys(ENCODERS)) {
    const encoder = ENCODERS[format];
    written[format] = [];
    for (const width of widths) {
      const name = `podcast-studio-${width}-${hash}.${encoder.extension}`;
      const buffer = await encoder.run(
        sharp(input, { limitInputPixels: 60_000_000 }).resize({ width, withoutEnlargement: true }),
      ).toBuffer();
      await writeFile(resolve(brandDir, name), buffer);
      written[format].push({ width, name, bytes: buffer.length });
      rows.push({ format, width, name, bytes: buffer.length });
    }
  }

  const lqip = await sharp(input, { limitInputPixels: 60_000_000 })
    .resize({ width: LQIP.width, withoutEnlargement: true })
    .avif({ quality: LQIP.quality, effort: 9 })
    .toBuffer();

  await writeFile(modulePath, generateModule({ hash, metadata, written, lqip }));

  const widest = rows.filter((row) => row.width === widths.at(-1));
  console.log(`\nИзточник: ${source}`);
  console.log(`Размер:   ${metadata.width}x${metadata.height} · sha256[0..8] = ${hash}\n`);
  console.log("формат   ширина   файл                                     размер");
  for (const row of rows) {
    console.log(
      `${row.format.padEnd(8)} ${String(row.width).padStart(4)}px   ${row.name.padEnd(40)} ${kb(row.bytes)}`,
    );
  }
  console.log(`\nLQIP (${LQIP.width}px, вграден base64): ${lqip.length} байта`);
  console.log(`Генериран модул: ${modulePath}`);

  const overBudget = widest.filter((row) => row.bytes > STUDIO_PHOTO_BUDGET);
  if (overBudget.length) {
    console.error(
      `\nПРЕДУПРЕЖДЕНИЕ: най-широкият вариант е над бюджета (${kb(STUDIO_PHOTO_BUDGET)}).`,
    );
    for (const row of overBudget) console.error(`  ${row.name}: ${kb(row.bytes)}`);
    console.error("Качеството не е променено. Решете: по-малко ширини или приемане на размера.");
    process.exitCode = 1;
  }
}

function generateModule({ hash, metadata, written, lqip }) {
  const srcset = (format) => written[format].map((item) => `/brand/${item.name} ${item.width}w`).join(", ");
  const largest = (format) => `/brand/${written[format].at(-1).name}`;
  return `// Generated by scripts/build-studio-photo.mjs — do not edit by hand.
// Source: ${metadata.width}x${metadata.height}, content hash ${hash}.
export const STUDIO_PHOTO = {
  hash: ${JSON.stringify(hash)},
  width: ${metadata.width},
  height: ${metadata.height},
  sizes: "100vw",
  avif: ${JSON.stringify(largest("avif"))},
  fallback: ${JSON.stringify(largest("jpeg"))},
  srcsetAvif: ${JSON.stringify(srcset("avif"))},
  srcsetWebp: ${JSON.stringify(srcset("webp"))},
  srcsetJpeg: ${JSON.stringify(srcset("jpeg"))},
  lqip: ${JSON.stringify(`data:image/avif;base64,${lqip.toString("base64")}`)},
} as const;
`;
}

await main();
