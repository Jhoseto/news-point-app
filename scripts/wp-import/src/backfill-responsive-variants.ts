/**
 * Additive backfill: for every news media asset, ensure the Studio width ladder
 * (-w320…1920.webp) exists beside the master. Never overwrites the master or
 * legacy -card.webp.
 *
 * Prefer WordPress source bytes when available (best quality). Fall back to the
 * local master WebP. Resumable via progress file.
 *
 *   pnpm --filter @newspoint/wp-import exec tsx src/backfill-responsive-variants.ts
 *   … --limit=100 --concurrency=2 --offset=0
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { eq, isNotNull } from "drizzle-orm";
import { imageVariantsSchema } from "@newspoint/content";
import { createScriptDb, mediaAssets, mediaPresentations } from "@newspoint/db/node";
import { ioExists, ioRead, ioWrite } from "./media-io";
import {
  encodeLadderVariant,
  neededWidths,
  presentationsWithoutRedundantCard,
  probeImage,
  variantKeyForWidth,
} from "./responsive-ladder";
import { fetchOriginBytes } from "./wp-client";

type Progress = {
  doneIds: string[];
  optimized: number;
  skipped: number;
  failed: Array<{ id: string; error: string }>;
  updatedAt: string;
};

function arg(name: string, fallback: string): string {
  const hit = process.argv.find((entry) => entry.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

const limit = Math.max(0, Number(arg("limit", "0")) || 0);
const offset = Math.max(0, Number(arg("offset", "0")) || 0);
const concurrency = Math.min(4, Math.max(1, Number(arg("concurrency", "2")) || 2));
const dryRun = flag("dry-run");
const preferOrigin = !flag("from-master");
const progressPath = resolve(
  process.env.MEDIA_BACKFILL_PROGRESS?.trim() ||
    resolve(process.cwd(), "../../logs/media-responsive-backfill.json"),
);

const { db, close } = createScriptDb("dev");

async function loadProgress(): Promise<Progress> {
  try {
    return JSON.parse(await readFile(progressPath, "utf8")) as Progress;
  } catch {
    return { doneIds: [], optimized: 0, skipped: 0, failed: [], updatedAt: new Date().toISOString() };
  }
}

async function saveProgress(progress: Progress): Promise<void> {
  progress.updatedAt = new Date().toISOString();
  await mkdir(dirname(progressPath), { recursive: true });
  await writeFile(progressPath, JSON.stringify(progress, null, 2));
}

async function sourceBytes(asset: {
  storageKey: string | null;
  sourceUrl: string | null;
}): Promise<{ bytes: Buffer; via: "origin" | "master" } | null> {
  if (preferOrigin && asset.sourceUrl) {
    try {
      const origin = await fetchOriginBytes(asset.sourceUrl);
      if (origin?.length) return { bytes: origin, via: "origin" };
    } catch {
      /* fall through to master */
    }
  }
  if (!asset.storageKey) return null;
  const master = await ioRead(asset.storageKey);
  if (!master?.length) return null;
  return { bytes: master, via: "master" };
}

async function processAsset(asset: {
  id: string;
  storageKey: string | null;
  sourceUrl: string | null;
  width: number | null;
  height: number | null;
}): Promise<"optimized" | "skipped"> {
  if (!asset.storageKey?.startsWith("news/") || asset.storageKey.includes("-card.webp") || /-w\d+\.webp$/i.test(asset.storageKey)) {
    return "skipped";
  }
  if (!(await ioExists(asset.storageKey))) return "skipped";

  const source = await sourceBytes(asset);
  if (!source) return "skipped";
  const probed = await probeImage(source.bytes);
  const width = probed.width;
  const missing: number[] = [];
  for (const rung of neededWidths(width)) {
    if (!(await ioExists(variantKeyForWidth(asset.storageKey, rung)))) missing.push(rung);
  }
  if (!missing.length) {
    await maybeUpgradePresentation(asset.id, asset.storageKey, width, dryRun);
    return "skipped";
  }

  if (dryRun) {
    console.log(`[dry-run] ${asset.storageKey} missing=${missing.join(",")} via=${source.via}`);
    return "optimized";
  }

  const generated: Array<{ key: string; width: number; height: number }> = [];
  for (const rung of missing) {
    const encoded = await encodeLadderVariant(source.bytes, rung);
    const key = variantKeyForWidth(asset.storageKey, encoded.width);
    await ioWrite(key, encoded.buffer);
    generated.push({ key, width: encoded.width, height: encoded.height });
  }

  const onDisk: Array<{ key: string; width: number; height: number }> = [...generated];
  for (const rung of neededWidths(width)) {
    const key = variantKeyForWidth(asset.storageKey, rung);
    if (onDisk.some((entry) => entry.key === key)) continue;
    if (!(await ioExists(key))) continue;
    const bytes = await ioRead(key);
    if (!bytes) continue;
    const meta = await probeImage(bytes);
    onDisk.push({ key, width: meta.width, height: meta.height });
  }
  await writePresentation(asset.id, onDisk, false);

  if (!asset.width || !asset.height) {
    await db.update(mediaAssets).set({ width, height: probed.height }).where(eq(mediaAssets.id, asset.id));
  }

  console.log(`ok ${asset.storageKey} +${generated.length} via=${source.via}`);
  return "optimized";
}

async function maybeUpgradePresentation(mediaAssetId: string, masterKey: string, sourceWidth: number, dry: boolean) {
  const [presentation] = await db
    .select()
    .from(mediaPresentations)
    .where(eq(mediaPresentations.mediaAssetId, mediaAssetId))
    .limit(1);
  const current = Array.isArray(presentation?.variants) ? presentation.variants : [];
  const hasCardOnly = current.length > 0 && current.every((entry) => entry.url.includes("-card.webp"));
  const thin = current.length < Math.min(3, neededWidths(sourceWidth).length);
  if (!hasCardOnly && !thin) return;

  const onDisk: Array<{ key: string; width: number; height: number }> = [];
  for (const rung of neededWidths(sourceWidth)) {
    const key = variantKeyForWidth(masterKey, rung);
    if (!(await ioExists(key))) continue;
    const bytes = await ioRead(key);
    if (!bytes) continue;
    const meta = await probeImage(bytes);
    onDisk.push({ key, width: meta.width, height: meta.height });
  }
  if (onDisk.length < 2) return;
  await writePresentation(mediaAssetId, onDisk, dry);
}

async function writePresentation(
  mediaAssetId: string,
  onDisk: Array<{ key: string; width: number; height: number }>,
  dry: boolean,
) {
  if (!onDisk.length) return;
  const variants = imageVariantsSchema.parse(
    presentationsWithoutRedundantCard(
      onDisk.map((entry) => ({ url: `/media/${entry.key}`, width: entry.width, height: entry.height })),
    ),
  );
  if (dry) return;
  await db
    .insert(mediaPresentations)
    .values({ mediaAssetId, variants })
    .onConflictDoUpdate({
      target: mediaPresentations.mediaAssetId,
      set: { variants, updatedAt: new Date() },
    });
}

async function mapPool<T>(items: T[], size: number, worker: (item: T) => Promise<void>): Promise<void> {
  let index = 0;
  const runners = Array.from({ length: size }, async () => {
    while (index < items.length) {
      const current = items[index++]!;
      await worker(current);
    }
  });
  await Promise.all(runners);
}

const progress = await loadProgress();
const done = new Set(progress.doneIds);

const rows = await db
  .select({
    id: mediaAssets.id,
    storageKey: mediaAssets.storageKey,
    sourceUrl: mediaAssets.sourceUrl,
    width: mediaAssets.width,
    height: mediaAssets.height,
  })
  .from(mediaAssets)
  .where(isNotNull(mediaAssets.storageKey));

const queue = rows
  .filter((row) => row.storageKey?.startsWith("news/") && !done.has(row.id))
  .slice(offset, limit > 0 ? offset + limit : undefined);

console.log(
  `backfill queue=${queue.length} concurrency=${concurrency} dryRun=${dryRun} preferOrigin=${preferOrigin} progress=${progressPath}`,
);

await mapPool(queue, concurrency, async (asset) => {
  try {
    const result = await processAsset(asset);
    if (result === "optimized") progress.optimized += 1;
    else progress.skipped += 1;
    if (!dryRun) {
      done.add(asset.id);
      progress.doneIds = [...done];
      if ((progress.optimized + progress.skipped) % 25 === 0) await saveProgress(progress);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    progress.failed = progress.failed.filter((entry) => entry.id !== asset.id);
    progress.failed.push({ id: asset.id, error: message });
    console.error(`fail ${asset.storageKey}: ${message}`);
    // Do not mark failed ids done — a later resume retries them.
  }
});

if (!dryRun) await saveProgress(progress);
else console.log("dry-run: progress file not updated");
console.log(
  `done optimized=${progress.optimized} skipped=${progress.skipped} failed=${progress.failed.length}`,
);
await close();
process.exit(progress.failed.length ? 1 : 0);
