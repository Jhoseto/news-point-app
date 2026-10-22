import "server-only";
import { eq, sql } from "@newspoint/db/orm";
import { mediaPublicPath } from "@newspoint/content";
import { getDb, mediaAssets } from "@newspoint/db";

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

const NEWS_MASTER = sql`storage_key ~ '^news/[0-9]{4}/(0[1-9]|1[0-2])/[^/]+\\.webp$' and storage_key !~ '-card\\.webp$'`;

export async function listMediaFolder(folder: string, offset = 0, limit = 80): Promise<{ items: LibraryImage[]; total: number }> {
  const safe = mediaFolder(folder);
  if (!safe || !safe.includes("/", 5)) return { items: [], total: 0 };
  const prefix = `${safe}/%`;
  const db = getDb();
  const [count] = await db.execute<{ total: number }>(sql`
    select count(*)::int as total from media_assets
    where storage_key like ${prefix}
      and (mime is null or mime not like 'video/%')
      and storage_key !~ '-card\\.webp$'
      and split_part(storage_key, '/', 5) = ''
  `);
  const rows = await db.execute<{ id: string; storage_key: string; alt: string; source_url: string | null }>(sql`
    select id, storage_key, alt, source_url
    from media_assets
    where storage_key like ${prefix}
      and (mime is null or mime not like 'video/%')
      and storage_key !~ '-card\\.webp$'
      and split_part(storage_key, '/', 5) = ''
    order by created_at desc, id desc
    limit ${limit} offset ${offset}
  `);
  return { total: Number(count?.total ?? 0), items: mapLibraryRows(rows) };
}

/** Newest upload first across the whole news media archive. */
export async function listMediaArchive(offset = 0, limit = 80): Promise<{ items: LibraryImage[]; total: number }> {
  const db = getDb();
  const [count] = await db.execute<{ total: number }>(sql`
    select count(*)::int as total from media_assets where ${NEWS_MASTER}
  `);
  const rows = await db.execute<{ id: string; storage_key: string; alt: string; source_url: string | null }>(sql`
    select id, storage_key, alt, source_url
    from media_assets
    where ${NEWS_MASTER}
    order by created_at desc, id desc
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
    order by created_at desc, id desc
    limit ${limit} offset ${offset}
  `);
  return { total: Number(count?.total ?? 0), items: mapLibraryRows(rows) };
}

/** Searchable display name (`alt`). Does not rename the file on disk. */
export function normalizeMediaName(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 240);
}

export async function renameMediaAsset(id: string, name: string): Promise<LibraryImage> {
  const alt = normalizeMediaName(name);
  if (!alt) {
    const error = new Error("Въведете име за снимката.") as Error & { status: number; code: string };
    error.status = 400;
    error.code = "invalid_input";
    throw error;
  }
  const [row] = await getDb()
    .update(mediaAssets)
    .set({ alt, updatedAt: new Date() })
    .where(eq(mediaAssets.id, id))
    .returning({ id: mediaAssets.id, storageKey: mediaAssets.storageKey, alt: mediaAssets.alt, sourceUrl: mediaAssets.sourceUrl });
  if (!row) {
    const error = new Error("Снимката не съществува.") as Error & { status: number; code: string };
    error.status = 404;
    error.code = "not_found";
    throw error;
  }
  return mapLibraryRows([{ id: row.id, storage_key: row.storageKey ?? "", alt: row.alt, source_url: row.sourceUrl }])[0]!;
}
