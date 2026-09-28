import { readdir, rm } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { eq } from "drizzle-orm";
import { imageVariantsSchema } from "@newspoint/content";
import { createScriptDb, mediaAssets, mediaPresentations } from "@newspoint/db/node";
import { mirrorNewsImage, storedFilePath } from "./mirror-image";

const { db, close } = createScriptDb("dev");
const keep = new Set<string>();
let copied = 0;
let skipped = 0;

const rows = await db
  .select({ id: mediaAssets.id, sourceUrl: mediaAssets.sourceUrl })
  .from(mediaAssets)
  .where(eq(mediaAssets.provider, "wordpress_origin"));

for (const row of rows) {
  if (!row.sourceUrl) {
    skipped += 1;
    continue;
  }
  const mirrored = await mirrorNewsImage(row.sourceUrl, { force: true });
  if (!mirrored) {
    skipped += 1;
    console.log(`skip ${row.sourceUrl}`);
    continue;
  }
  keep.add(mirrored.key);
  keep.add(mirrored.card.key);
  await db.update(mediaAssets).set({
    storageKey: mirrored.key,
    width: mirrored.width,
    height: mirrored.height,
    mime: "image/webp",
  }).where(eq(mediaAssets.id, row.id));
  const variants = imageVariantsSchema.parse([{
    url: `/media/${mirrored.card.key}`,
    width: mirrored.card.width,
    height: mirrored.card.height,
  }]);
  await db.insert(mediaPresentations).values({ mediaAssetId: row.id, variants })
    .onConflictDoUpdate({ target: mediaPresentations.mediaAssetId, set: { variants } });
  copied += 1;
}

const root = process.env.MEDIA_ROOT?.trim();
let removed = 0;
if (root) {
  const news = resolve(root, "news");
  const files: string[] = [];
  const walk = async (dir: string) => {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else files.push(full);
    }
  };
  try {
    await walk(news);
  } catch {
    /* no news directory yet */
  }
  for (const file of files) {
    const key = relative(root, file).split("\\").join("/");
    if (keep.has(key)) continue;
    await rm(file, { force: true });
    removed += 1;
  }
}

console.log(`optimized ${copied}, skipped ${skipped}, removed old files ${removed}`);
await close();
