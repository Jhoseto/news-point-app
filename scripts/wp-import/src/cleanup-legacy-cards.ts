/**
 * After the responsive backfill and editorial review: remove redundant
 * `-card.webp` files when the full -w ladder exists for that master.
 * Never deletes masters or -w* files.
 *
 * Default is dry-run. Pass --apply to delete.
 *
 *   pnpm --filter @newspoint/wp-import exec tsx src/cleanup-legacy-cards.ts
 *   pnpm --filter @newspoint/wp-import exec tsx src/cleanup-legacy-cards.ts --apply
 */
import { eq, isNotNull } from "drizzle-orm";
import { imageVariantsSchema } from "@newspoint/content";
import { createScriptDb, mediaAssets, mediaPresentations } from "@newspoint/db/node";
import { ioExists, ioRemove } from "./media-io";
import {
  cardKeyForMaster,
  neededWidths,
  presentationsWithoutRedundantCard,
  variantKeyForWidth,
} from "./responsive-ladder";

const apply = process.argv.includes("--apply");
const { db, close } = createScriptDb("dev");

const rows = await db
  .select({
    id: mediaAssets.id,
    storageKey: mediaAssets.storageKey,
    width: mediaAssets.width,
  })
  .from(mediaAssets)
  .where(isNotNull(mediaAssets.storageKey));

let removable = 0;
let removed = 0;
let kept = 0;
let presentationUpdates = 0;

for (const row of rows) {
  const masterKey = row.storageKey;
  if (!masterKey?.startsWith("news/") || masterKey.includes("-card.webp") || /-w\d+\.webp$/i.test(masterKey)) {
    continue;
  }
  const cardKey = cardKeyForMaster(masterKey);
  if (!(await ioExists(cardKey))) {
    kept += 1;
    continue;
  }
  const width = row.width ?? 0;
  const needed = width > 0 ? neededWidths(width) : [320, 480, 768, 1024, 1440, 1920];
  let ladderOk = needed.length === 0;
  if (!ladderOk) {
    ladderOk = true;
    for (const rung of needed) {
      if (!(await ioExists(variantKeyForWidth(masterKey, rung)))) {
        ladderOk = false;
        break;
      }
    }
  }
  if (!ladderOk) {
    kept += 1;
    continue;
  }

  removable += 1;
  console.log(`${apply ? "delete" : "would-delete"} ${cardKey}`);
  if (apply) {
    if (await ioRemove(cardKey)) removed += 1;
    const [presentation] = await db
      .select()
      .from(mediaPresentations)
      .where(eq(mediaPresentations.mediaAssetId, row.id))
      .limit(1);
    if (presentation && Array.isArray(presentation.variants)) {
      const next = imageVariantsSchema.parse(presentationsWithoutRedundantCard(presentation.variants));
      if (JSON.stringify(next) !== JSON.stringify(presentation.variants)) {
        await db
          .update(mediaPresentations)
          .set({ variants: next, updatedAt: new Date() })
          .where(eq(mediaPresentations.mediaAssetId, row.id));
        presentationUpdates += 1;
      }
    }
  }
}

console.log(
  `${apply ? "applied" : "dry-run"} removable=${removable} removed=${removed} kept=${kept} presentationUpdates=${presentationUpdates}`,
);
if (!apply && removable > 0) {
  console.log("Re-run with --apply after you have reviewed the site.");
}
await close();
