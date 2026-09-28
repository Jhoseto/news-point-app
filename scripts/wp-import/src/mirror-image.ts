import { access, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { newsStorageKey } from "@newspoint/content";
import sharp from "sharp";
import { fetchOriginBytes } from "./wp-client";

const LARGE_EDGE = 2000;
const CARD_EDGE = 960;

export type MirroredNewsImage = {
  key: string;
  width: number;
  height: number;
  card: { key: string; width: number; height: number };
};

function mediaRoot(): string {
  return process.env.MEDIA_ROOT?.trim() ?? "";
}

export function storedFilePath(storageKey: string): string | null {
  const root = mediaRoot();
  if (!root || (!storageKey.startsWith("news/") && !storageKey.startsWith("users/"))) return null;
  const parts = storageKey.split("/");
  if (parts.some((part) => !part || part === "." || part === "..")) return null;
  const full = resolve(root, ...parts);
  if (!full.startsWith(resolve(root))) return null;
  return full;
}

function webpKey(sourceUrl: string, card: boolean): string | null {
  const key = newsStorageKey(sourceUrl);
  if (!key) return null;
  const base = key.replace(/\.[a-z0-9]+$/i, "");
  return card ? `${base}-card.webp` : `${base}.webp`;
}

async function writeOptimized(sourceUrl: string, bytes: Buffer, edge: number, quality: number, card: boolean) {
  const key = webpKey(sourceUrl, card);
  const path = key ? storedFilePath(key) : null;
  if (!key || !path) return null;
  const result = await sharp(bytes, { failOn: "warning", limitInputPixels: 50_000_000 })
    .rotate()
    .resize({ width: edge, height: edge, fit: "inside", withoutEnlargement: true })
    .webp({ quality, effort: 4 })
    .timeout({ seconds: 20 })
    .toBuffer({ resolveWithObject: true });
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, result.data);
  return { key, width: result.info.width, height: result.info.height };
}

/** Download a news photo and store a large and a card WebP. Metadata is discarded. */
export async function mirrorNewsImage(sourceUrl: string, options?: { force?: boolean }): Promise<MirroredNewsImage | null> {
  if (process.env.DEV_REMOTE === "1") return null;
  if (!mediaRoot()) return null;
  const largeKey = webpKey(sourceUrl, false);
  const cardKey = webpKey(sourceUrl, true);
  const largePath = largeKey ? storedFilePath(largeKey) : null;
  const cardPath = cardKey ? storedFilePath(cardKey) : null;
  if (!largeKey || !cardKey || !largePath || !cardPath) return null;
  try {
    if (options?.force) throw new Error("rewrite");
    await access(largePath);
    await access(cardPath);
    const large = await sharp(largePath).metadata();
    const card = await sharp(cardPath).metadata();
    if (large.width && large.height && card.width && card.height) {
      return { key: largeKey, width: large.width, height: large.height, card: { key: cardKey, width: card.width, height: card.height } };
    }
  } catch {
    /* create both files */
  }
  const bytes = await fetchOriginBytes(sourceUrl);
  if (!bytes?.length) return null;
  try {
    const large = await writeOptimized(sourceUrl, bytes, LARGE_EDGE, 82, false);
    const card = await writeOptimized(sourceUrl, bytes, CARD_EDGE, 78, true);
    if (!large || !card) return null;
    return { key: large.key, width: large.width, height: large.height, card: { key: card.key, width: card.width, height: card.height } };
  } catch {
    return null;
  }
}
