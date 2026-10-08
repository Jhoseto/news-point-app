import "server-only";
import { inArray } from "drizzle-orm";
import { getDb, mediaAssets } from "@newspoint/db";
import { mediaPublicPath } from "@newspoint/content";

/** Resolve a known WordPress upload to its actual copy, including JPG -> WebP conversion. */
export async function legacyMediaDestination(path: string[]): Promise<string | null> {
  if (!path.length || path.some((part) => !part || part === "." || part === ".." || /[\\/\u0000-\u001f]/.test(part))) return null;
  const encoded = path.map(encodeURIComponent).join("/");
  const decoded = path.join("/");
  const candidates = [...new Set([encoded, decoded])].flatMap((suffix) =>
    ["https://newspoint.bg", "https://www.newspoint.bg", "http://newspoint.bg", "http://www.newspoint.bg"]
      .map((host) => `${host}/wp-content/uploads/${suffix}`));
  const rows = await getDb().select({ storageKey: mediaAssets.storageKey }).from(mediaAssets)
    .where(inArray(mediaAssets.sourceUrl, candidates));
  const destinations = new Set(rows.flatMap((row) => {
    const destination = row.storageKey ? mediaPublicPath(row.storageKey) : null;
    return destination ? [destination] : [];
  }));
  // Conflicting mappings need editorial investigation, never an arbitrary target.
  return destinations.size === 1 ? destinations.values().next().value! : null;
}
