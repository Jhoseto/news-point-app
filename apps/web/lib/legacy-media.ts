import "server-only";
import { inArray } from "drizzle-orm";
import { getDb, mediaAssets } from "@newspoint/db";
import { mediaPublicPath } from "@newspoint/content";
import { stat } from "node:fs/promises";
import { mediaFile } from "./media-disk";

/** Resolve a known WordPress upload to its actual copy, including JPG -> WebP conversion. */
export async function legacyMediaDestination(path: string[]): Promise<string | null> {
  if (!path.length || path.some((part) => !part || part === "." || part === ".." || /[\\/\u0000-\u001f]/.test(part))) return null;
  const exact = await destinationsFor(path);
  // Never replace an ambiguous or unusable exact mapping with a guessed original.
  if (exact.matched) return exact.destinations.size === 1 ? [...exact.destinations][0]! : null;
  const thumbnail = path.at(-1)!.match(/^(.+)-[1-9]\d{0,4}x[1-9]\d{0,4}(\.(?:jpe?g|png|webp|gif|avif))$/i);
  if (path.length !== 3 || !/^\d{4}$/.test(path[0]!) || !/^(?:0[1-9]|1[0-2])$/.test(path[1]!) || !thumbnail) return null;
  const original = await destinationsFor([...path.slice(0, -1), thumbnail[1]! + thumbnail[2]!]);
  if (original.destinations.size !== 1) return null;
  const destination = [...original.destinations][0]!;
  const storageKey = original.keys.get(destination);
  const file = storageKey ? mediaFile(storageKey) : null;
  // Only send an old thumbnail to a known original with a present migrated copy.
  if (!file || !await stat(file).then(value => value.isFile() && value.size > 0).catch(() => false)) return null;
  return destination;
}

async function destinationsFor(path: string[]) {
  const encoded = path.map(encodeURIComponent).join("/");
  const decoded = path.join("/");
  const candidates = [...new Set([encoded, decoded])].flatMap((suffix) =>
    ["https://newspoint.bg", "https://www.newspoint.bg", "http://newspoint.bg", "http://www.newspoint.bg"]
      .map((host) => `${host}/wp-content/uploads/${suffix}`));
  const rows = await getDb().select({ storageKey: mediaAssets.storageKey }).from(mediaAssets)
    .where(inArray(mediaAssets.sourceUrl, candidates));
  const keys = new Map<string, string>();
  const destinations = new Set(rows.flatMap((row) => {
    const destination = row.storageKey ? mediaPublicPath(row.storageKey) : null;
    if (destination && row.storageKey) keys.set(destination, row.storageKey);
    return destination ? [destination] : [];
  }));
  // Conflicting mappings need editorial investigation, never an arbitrary target.
  return { destinations, keys, matched: rows.length > 0 };
}
