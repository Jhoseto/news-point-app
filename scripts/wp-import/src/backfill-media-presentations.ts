import { and, desc, eq, isNotNull, lte, sql } from "drizzle-orm";
import { createScriptDb, articles, mediaAssets, mediaPresentations, hasMediaPresentations } from "@newspoint/db/node";
import { wordpressVariants } from "./media-variants";
import { WpClient } from "./wp-client";

// Metadata only, up to 200 existing public hero photos; never downloads/copies
// archive images. Dry run by default. --write requires migration 12.
const write = process.argv.includes("--write");
if (process.argv.slice(2).some(arg => arg !== "--write" && arg !== "--dry-run")) throw new Error("Use --dry-run or --write");
const { db, close } = createScriptDb();
try {
  if (write && !await hasMediaPresentations(db)) throw new Error("Apply migration 12 before --write");
  const rows = await db.selectDistinct({ id: mediaAssets.id, wpId: mediaAssets.wpId, sourceUrl: mediaAssets.sourceUrl, createdAt: mediaAssets.createdAt })
    .from(mediaAssets).innerJoin(articles, eq(articles.heroMediaId, mediaAssets.id))
    .where(and(eq(mediaAssets.provider, "wordpress_origin"), isNotNull(mediaAssets.wpId), eq(articles.isPublic, true), lte(articles.publishedAt, sql`now()`)))
    .orderBy(desc(mediaAssets.createdAt)).limit(200);
  const client = new WpClient("https://newspoint.bg");
  let candidates = 0, updated = 0, mismatched = 0;
  const sample: { url: string; widths: number[] }[] = [];
  for (let offset = 0; offset < rows.length; offset += 100) {
    const batch = rows.slice(offset, offset + 100);
    const metadata = await client.media(batch.map(row => row.wpId!));
    const byId = new Map(metadata.map(item => [item.id, item]));
    for (const row of batch) {
      const media = byId.get(row.wpId!);
      if (!media || media.source_url !== row.sourceUrl) { mismatched++; continue; }
      const variants = wordpressVariants(media);
      if (variants.length < 2) continue;
      candidates++;
      if (sample.length < 4) sample.push({ url: media.source_url, widths: variants.map(item => item.width) });
      if (write) {
        await db.insert(mediaPresentations).values({ mediaAssetId: row.id, variants })
          .onConflictDoUpdate({ target: mediaPresentations.mediaAssetId, set: { variants } });
        updated++;
      }
    }
  }
  console.log(JSON.stringify({ mode: write ? "write" : "dry-run", checked: rows.length, candidates, updated, mismatched, requests: client.requests, sample }, null, 2));
} finally { await close(); }
