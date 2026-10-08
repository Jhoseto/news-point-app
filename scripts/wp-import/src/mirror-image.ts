import { access, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { newsStorageKey } from "@newspoint/content";
import sharp from "sharp";
import { fetchOriginBytes } from "./wp-client";

/** Same ladder / quality as Studio upload + archive optimize (`apps/studio/lib/uploaded-photo.ts`). */
const VARIANT_WIDTHS = [320, 480, 768, 1024, 1440, 1920] as const;
const MASTER_MAX_WIDTH = 4096;
const WEBP_QUALITY = 84;
/** Legacy companion still written so older rows and tools that expect `-card.webp` keep working. */
const CARD_EDGE = 960;

export type MirroredVariant = { key: string; width: number; height: number };

export type MirroredNewsImage = {
  key: string;
  width: number;
  height: number;
  /** Full responsive ladder (and legacy card), for `media_presentations`. */
  variants: MirroredVariant[];
  /** @deprecated Prefer `variants`; kept for callers that only need the card slot. */
  card: MirroredVariant;
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

function masterKeyFromSource(sourceUrl: string): string | null {
  const key = newsStorageKey(sourceUrl);
  if (!key) return null;
  return key.replace(/\.[a-z0-9]+$/i, "") + ".webp";
}

function siblingKey(masterKey: string, suffix: string): string {
  return masterKey.replace(/\.webp$/i, "") + suffix;
}

function neededWidths(sourceWidth: number): number[] {
  return VARIANT_WIDTHS.filter((width) => width < sourceWidth);
}

async function fileMeta(path: string): Promise<{ width: number; height: number } | null> {
  try {
    await access(path);
    const meta = await sharp(path).metadata();
    if (!meta.width || !meta.height) return null;
    return { width: meta.width, height: meta.height };
  } catch {
    return null;
  }
}

async function writeWebp(
  bytes: Buffer,
  edge: number,
  key: string,
): Promise<MirroredVariant | null> {
  const path = storedFilePath(key);
  if (!path) return null;
  const result = await sharp(bytes, { failOn: "warning", limitInputPixels: 50_000_000 })
    .rotate()
    .resize({ width: edge, height: edge, fit: "inside", withoutEnlargement: true })
    .webp({ quality: WEBP_QUALITY, effort: 4 })
    .timeout({ seconds: 30 })
    .toBuffer({ resolveWithObject: true });
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, result.data);
  return { key, width: result.info.width, height: result.info.height };
}

/**
 * Download a news photo and store the Studio-equivalent WebP master + width ladder.
 * Variants are encoded from the original bytes (not from the master) so quality does not drop twice.
 * If a legacy master+card pair already exists, leave it alone on normal sync (no mass rewrite).
 */
export async function mirrorNewsImage(sourceUrl: string, options?: { force?: boolean }): Promise<MirroredNewsImage | null> {
  if (process.env.DEV_REMOTE === "1") return null;
  if (!mediaRoot()) return null;
  const masterKey = masterKeyFromSource(sourceUrl);
  const masterPath = masterKey ? storedFilePath(masterKey) : null;
  if (!masterKey || !masterPath) return null;

  const cardKey = siblingKey(masterKey, "-card.webp");

  if (!options?.force) {
    const existing = await readExistingMirror(masterKey, cardKey);
    if (existing) return existing;
  }

  const bytes = await fetchOriginBytes(sourceUrl);
  if (!bytes?.length) return null;
  try {
    return await writeFullMirror(bytes, masterKey, cardKey);
  } catch {
    return null;
  }
}

async function readExistingMirror(masterKey: string, cardKey: string): Promise<MirroredNewsImage | null> {
  const masterPath = storedFilePath(masterKey);
  if (!masterPath) return null;
  const master = await fileMeta(masterPath);
  if (!master) return null;

  const ladder: MirroredVariant[] = [];
  const needed = neededWidths(master.width);
  for (const width of needed) {
    const key = siblingKey(masterKey, `-w${width}.webp`);
    const path = storedFilePath(key);
    if (!path) continue;
    const meta = await fileMeta(path);
    if (meta) ladder.push({ key, width: meta.width, height: meta.height });
  }

  const cardPath = storedFilePath(cardKey);
  const cardFile = cardPath ? await fileMeta(cardPath) : null;
  const card: MirroredVariant | null = cardFile
    ? { key: cardKey, width: cardFile.width, height: cardFile.height }
    : ladder.find((entry) => Math.abs(entry.width - CARD_EDGE) <= 64) ?? ladder[ladder.length - 1] ?? null;

  // New pipeline already on disk — reuse without hitting WordPress again.
  if (needed.length === 0 || ladder.length >= needed.length) {
    if (!card && !ladder.length) {
      return { key: masterKey, width: master.width, height: master.height, variants: [], card: { key: masterKey, width: master.width, height: master.height } };
    }
    const variants = ladder.slice(0, 6);
    return {
      key: masterKey,
      width: master.width,
      height: master.height,
      variants: variants.length ? variants : card ? [card] : [],
      card: card ?? variants[variants.length - 1]!,
    };
  }

  // Legacy import: master + card only. Leave alone on normal sync ticks.
  if (cardFile && card) {
    return {
      key: masterKey,
      width: master.width,
      height: master.height,
      variants: [card],
      card,
    };
  }

  return null;
}

async function writeFullMirror(bytes: Buffer, masterKey: string, cardKey: string): Promise<MirroredNewsImage | null> {
  const probe = await sharp(bytes, { failOn: "warning", limitInputPixels: 50_000_000 }).rotate().metadata();
  if (!probe.width || !probe.height) return null;

  const master = await writeWebp(bytes, Math.min(probe.width, MASTER_MAX_WIDTH), masterKey);
  if (!master) return null;

  const variants: MirroredVariant[] = [];
  for (const width of neededWidths(master.width)) {
    const written = await writeWebp(bytes, width, siblingKey(masterKey, `-w${width}.webp`));
    if (written) variants.push(written);
  }

  // Keep `-card.webp` on disk for legacy tools; presentations use the width ladder only
  // (max 6) so the card does not push out 1920w.
  const card = await writeWebp(bytes, Math.min(CARD_EDGE, master.width), cardKey);
  const presentation = [...variants].sort((a, b) => a.width - b.width).slice(0, 6);
  const cardOut =
    card ??
    presentation.find((entry) => Math.abs(entry.width - CARD_EDGE) <= 64) ??
    presentation[presentation.length - 1];
  if (!cardOut) return null;

  return {
    key: master.key,
    width: master.width,
    height: master.height,
    variants: presentation,
    card: cardOut,
  };
}
