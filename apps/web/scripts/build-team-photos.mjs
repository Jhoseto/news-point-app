import { createHash } from "node:crypto";
import { readFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";

const sourceDir = process.argv[2];
if (!sourceDir) throw new Error("Usage: node build-team-photos.mjs <source-directory>");

const photos = {
  "team-nikolai": "NikolaiMutavski.png",
  "team-petar": "PetarGeorgiev.png",
  "team-atanas": "AtanasDominov.png",
  "team-stanimir": "StanimirDikelov.png",
  "team-office-1": "Office1.png",
  "team-office-2": "Office2.png",
  "team-office-3": "Office3.png",
  "team-office-4": "Office4.png",
  "team-office-5": "Office5.png",
};
const outputDir = resolve(import.meta.dirname, "../public/brand");
await mkdir(outputDir, { recursive: true });

for (const [name, filename] of Object.entries(photos)) {
  const input = await readFile(resolve(sourceDir, filename));
  const hash = createHash("sha256").update(input).digest("hex").slice(0, 8);
  for (const width of [800, 1600]) {
    const output = resolve(outputDir, `${name}-${width}-${hash}.webp`);
    await sharp(input).rotate().resize({ width, withoutEnlargement: true }).webp({ quality: 82, effort: 5 }).toFile(output);
    console.log(`${name} ${width}: /brand/${name}-${width}-${hash}.webp`);
  }
}
