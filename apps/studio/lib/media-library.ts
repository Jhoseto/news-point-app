import "server-only";
import { sql } from "@newspoint/db/orm";
import { mediaPublicPath } from "@newspoint/content";
import { getDb } from "@newspoint/db";

/** Path on the public site. Studio and the site share one host in production. */
export function libraryImageUrl(storageKey: string, sourceUrl: string | null): string {
  return mediaPublicPath(storageKey) ?? sourceUrl ?? "";
}

export type MediaFolderYear = { year: string; months: string[] };

export type LibraryImage = {
  id: string;
  url: string;
  alt: string;
  name: string;
};

const FOLDER = /^news\/(\d{4})(?:\/(0[1-9]|1[0-2]))?$/;

/** Only the news/year/month layout used on the server disk. */
export function mediaFolder(value: string): string | null {
  const folder = value.trim().replace(/^\/+|\/+$/g, "");
  return FOLDER.test(folder) ? folder : null;
}

export async function listMediaYears(): Promise<MediaFolderYear[]> {
  const rows = await getDb().execute<{ year: string; month: string }>(sql`
    select split_part(storage_key, '/', 2) as year, split_part(storage_key, '/', 3) as month
    from media_assets
    where storage_key ~ '^news/[0-9]{4}/(0[1-9]|1[0-2])/[^/]+\\.webp$'
      and storage_key !~ '-card\\.webp$'
    group by 1, 2
    order by 1 desc, 2 desc
  `);
  const years = new Map<string, string[]>();
  for (const row of rows) {
    const months = years.get(row.year) ?? [];
    months.push(row.month);
    years.set(row.year, months);
  }
  return [...years.entries()].map(([year, months]) => ({ year, months }));
}

function mapLibraryRows(
  rows: { id: string; storage_key: string; alt: string; source_url: string | null }[],
): LibraryImage[] {
  return rows.map((row) => ({
    id: row.id,
    url: libraryImageUrl(row.storage_key, row.source_url),
    alt: row.alt,
    name: row.storage_key.split("/").pop()?.replace(/\.webp$/i, "") ?? row.alt,
  }));
}

export async function listMediaFolder(folder: string, offset = 0, limit = 80): Promise<{ items: LibraryImage[]; total: number }> {
  const safe = mediaFolder(folder);
  if (!safe || !safe.includes("/", 5)) return { items: [], total: 0 };
  const prefix = `${safe}/%`;
  const db = getDb();
  const [count] = await db.execute<{ total: number }>(sql`
    select count(*)::int as total from media_assets
    where storage_key like ${prefix}
      and storage_key !~ '-card\\.webp$'
      and split_part(storage_key, '/', 5) = ''
  `);
  const rows = await db.execute<{ id: string; storage_key: string; alt: string; source_url: string | null }>(sql`
    select id, storage_key, alt, source_url
    from media_assets
    where storage_key like ${prefix}
      and storage_key !~ '-card\\.webp$'
      and split_part(storage_key, '/', 5) = ''
    order by storage_key desc
    limit ${limit} offset ${offset}
  `);
  return { total: Number(count?.total ?? 0), items: mapLibraryRows(rows) };
}

/** Search by alt text or file name. Empty folder = whole news archive. */
export async function searchMediaLibrary(
  query: string,
  options: { folder?: string | null; offset?: number; limit?: number } = {},
): Promise<{ items: LibraryImage[]; total: number }> {
  const needle = query.trim().slice(0, 80).replace(/[%_\\]/g, "");
  if (needle.length < 2) return { items: [], total: 0 };
  const folder = options.folder ? mediaFolder(options.folder) : null;
  if (options.folder && (!folder || !folder.includes("/", 5))) return { items: [], total: 0 };
  const pattern = `%${needle}%`;
  const offset = options.offset ?? 0;
  const limit = options.limit ?? 80;
  const scope = folder ? sql`and storage_key like ${`${folder}/%`}` : sql``;
  const db = getDb();
  const [count] = await db.execute<{ total: number }>(sql`
    select count(*)::int as total from media_assets
    where storage_key ~ '^news/[0-9]{4}/(0[1-9]|1[0-2])/[^/]+\\.webp$'
      and storage_key !~ '-card\\.webp$'
      ${scope}
      and (alt ilike ${pattern} or storage_key ilike ${pattern})
  `);
  const rows = await db.execute<{ id: string; storage_key: string; alt: string; source_url: string | null }>(sql`
    select id, storage_key, alt, source_url
    from media_assets
    where storage_key ~ '^news/[0-9]{4}/(0[1-9]|1[0-2])/[^/]+\\.webp$'
      and storage_key !~ '-card\\.webp$'
      ${scope}
      and (alt ilike ${pattern} or storage_key ilike ${pattern})
    order by storage_key desc
    limit ${limit} offset ${offset}
  `);
  return { total: Number(count?.total ?? 0), items: mapLibraryRows(rows) };
}
