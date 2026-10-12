import { newsStorageKey } from "@newspoint/content";
import {
  cardKeyForMaster,
  encodeLadderVariant,
  fileExists,
  MASTER_MAX_WIDTH,
  mediaRoot,
  neededWidths,
  probeImage,
  siblingKey,
  storedFilePath,
  variantKeyForWidth,
  writeStorageFile,
} from "./responsive-ladder";
import { fetchOriginBytes } from "./wp-client";

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

export { storedFilePath } from "./responsive-ladder";

function masterKeyFromSource(sourceUrl: string): string | null {
  const key = newsStorageKey(sourceUrl);
  if (!key) return null;
  return key.replace(/\.[a-z0-9]+$/i, "") + ".webp";
}

async function fileMeta(storageKey: string): Promise<{ width: number; height: number } | null> {
  if (!(await fileExists(storageKey))) return null;
  const path = storedFilePath(storageKey);
  if (!path) return null;
  try {
    const { readFile } = await import("node:fs/promises");
    const bytes = await readFile(path);
    return probeImage(bytes);
  } catch {
    return null;
  }
}

async function writeWebp(bytes: Buffer, edge: number, key: string): Promise<MirroredVariant | null> {
  if (!storedFilePath(key)) return null;
  try {
    const encoded = await encodeLadderVariant(bytes, edge);
    await writeStorageFile(key, encoded.buffer);
    return { key, width: encoded.width, height: encoded.height };
  } catch {
    return null;
  }
}

/**
 * Download a news photo and store the Studio-equivalent WebP master + width ladder
 * (`apps/studio/lib/uploaded-photo.ts` — same widths/quality, variants from original bytes).
 * If a legacy master+card pair already exists, leave it alone on normal sync (no mass rewrite).
 */
export async function mirrorNewsImage(sourceUrl: string, options?: { force?: boolean }): Promise<MirroredNewsImage | null> {
  if (process.env.DEV_REMOTE === "1") return null;
  if (!mediaRoot()) return null;
  const masterKey = masterKeyFromSource(sourceUrl);
  if (!masterKey || !storedFilePath(masterKey)) return null;

  const cardKey = cardKeyForMaster(masterKey);

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
  const master = await fileMeta(masterKey);
  if (!master) return null;

  const ladder: MirroredVariant[] = [];
  const needed = neededWidths(master.width);
  for (const width of needed) {
    const key = variantKeyForWidth(masterKey, width);
    const meta = await fileMeta(key);
    if (meta) ladder.push({ key, width: meta.width, height: meta.height });
  }

  const cardFile = await fileMeta(cardKey);
  const card: MirroredVariant | null = cardFile
    ? { key: cardKey, width: cardFile.width, height: cardFile.height }
    : ladder.find((entry) => Math.abs(entry.width - CARD_EDGE) <= 64) ?? ladder[ladder.length - 1] ?? null;

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
  const probe = await probeImage(bytes);
  const masterEdge = Math.min(probe.width, MASTER_MAX_WIDTH);
  const master = await writeWebp(bytes, masterEdge, masterKey);
  if (!master) return null;

  const widths = neededWidths(master.width);
  const [card, ...ladder] = await Promise.all([
    writeWebp(bytes, Math.min(CARD_EDGE, master.width), cardKey),
    ...widths.map(async (width) => writeWebp(bytes, width, variantKeyForWidth(masterKey, width))),
  ]);
  const variants = ladder.filter((entry): entry is MirroredVariant => entry !== null);
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
