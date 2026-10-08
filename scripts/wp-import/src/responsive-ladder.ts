import { access, mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import sharp from "sharp";

/** Shared with Studio upload / archive optimize. */
export const VARIANT_WIDTHS = [320, 480, 768, 1024, 1440, 1920] as const;
export const WEBP_QUALITY = 84;
export const MASTER_MAX_WIDTH = 4096;

export type LadderVariant = { key: string; width: number; height: number; url: string };

export function mediaRoot(): string {
  return process.env.MEDIA_ROOT?.trim() ?? "";
}

export function storedFilePath(storageKey: string): string | null {
  const root = mediaRoot();
  if (!root || !storageKey.startsWith("news/")) return null;
  const parts = storageKey.split("/");
  if (parts.some((part) => !part || part === "." || part === "..")) return null;
  const full = resolve(root, ...parts);
  if (!full.startsWith(resolve(root))) return null;
  return full;
}

export function siblingKey(masterKey: string, suffix: string): string {
  return masterKey.replace(/\.webp$/i, "").replace(/-w\d+$/i, "") + suffix;
}

export function neededWidths(sourceWidth: number): number[] {
  return VARIANT_WIDTHS.filter((width) => width < sourceWidth);
}

export function variantKeyForWidth(masterKey: string, width: number): string {
  return siblingKey(masterKey, `-w${width}.webp`);
}

export function cardKeyForMaster(masterKey: string): string {
  return siblingKey(masterKey, "-card.webp");
}

export async function fileExists(storageKey: string): Promise<boolean> {
  const path = storedFilePath(storageKey);
  if (!path) return false;
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function missingLadderWidths(masterKey: string, sourceWidth: number): Promise<number[]> {
  const missing: number[] = [];
  for (const width of neededWidths(sourceWidth)) {
    if (!(await fileExists(variantKeyForWidth(masterKey, width)))) missing.push(width);
  }
  return missing;
}

export async function probeImage(bytes: Buffer): Promise<{ width: number; height: number }> {
  const meta = await sharp(bytes, { limitInputPixels: 60_000_000 }).rotate().metadata();
  if (!meta.width || !meta.height) throw new Error("Невалидна снимка.");
  return { width: meta.width, height: meta.height };
}

/** Encode one ladder rung from original (or best available) pixels. */
export async function encodeLadderVariant(bytes: Buffer, width: number): Promise<{ width: number; height: number; buffer: Buffer }> {
  const buffer = await sharp(bytes, { limitInputPixels: 60_000_000 })
    .rotate()
    .resize({ width, fit: "inside", withoutEnlargement: true })
    .webp({ quality: WEBP_QUALITY, effort: 4 })
    .toBuffer();
  const meta = await sharp(buffer).metadata();
  return {
    buffer,
    width: meta.width ?? width,
    height: meta.height ?? Math.round(width * 0.56),
  };
}

export async function writeStorageFile(storageKey: string, bytes: Buffer): Promise<void> {
  const path = storedFilePath(storageKey);
  if (!path) throw new Error(`Невалиден storage key: ${storageKey}`);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, bytes);
}

export async function readStorageFile(storageKey: string): Promise<Buffer | null> {
  const path = storedFilePath(storageKey);
  if (!path) return null;
  try {
    return await readFile(path);
  } catch {
    return null;
  }
}

export async function removeStorageFile(storageKey: string): Promise<boolean> {
  const path = storedFilePath(storageKey);
  if (!path) return false;
  try {
    await unlink(path);
    return true;
  } catch {
    return false;
  }
}

export function presentationFromKeys(variants: Array<{ key: string; width: number; height: number }>): LadderVariant[] {
  return [...variants]
    .sort((a, b) => a.width - b.width)
    .slice(0, 6)
    .map((entry) => ({
      key: entry.key,
      width: entry.width,
      height: entry.height,
      url: `/media/${entry.key}`,
    }));
}

/** Drop legacy `-card` entries when a near-width ladder rung exists. */
export function presentationsWithoutRedundantCard(
  variants: Array<{ url: string; width: number; height: number }>,
): Array<{ url: string; width: number; height: number }> {
  const withoutCard = variants.filter((entry) => !entry.url.includes("-card.webp"));
  if (withoutCard.length >= 2) return withoutCard.slice(0, 6);
  return variants.slice(0, 6);
}
