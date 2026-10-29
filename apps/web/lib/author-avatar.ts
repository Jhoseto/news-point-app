import "server-only";
import { and, eq, lte, sql } from "drizzle-orm";
import { articles, getDb, staffUsers } from "@newspoint/db";
import { readMediaFile } from "./media-disk";

const headers = {
  "cache-control": "no-store, max-age=0",
  "content-type": "image/webp",
  "x-content-type-options": "nosniff",
};

async function privateStoragePhoto(path: string): Promise<Buffer | null> {
  const base = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!base || !key) return null;
  const response = await fetch(`${base}/storage/v1/object/authenticated/studio-profile-images/${path.split("/").map(encodeURIComponent).join("/")}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  return response.ok ? Buffer.from(await response.arrayBuffer()) : null;
}

/** Returns only the current photo of a staff member who authors public content. */
export async function currentPublicAuthorAvatar(staffUserId: string): Promise<Response | null> {
  const [row] = await getDb()
    .select({ image: staffUsers.image })
    .from(staffUsers)
    .innerJoin(articles, eq(articles.authorUserId, staffUsers.id))
    .where(and(eq(staffUsers.id, staffUserId), eq(articles.isPublic, true), lte(articles.publishedAt, sql`now()`)))
    .limit(1);
  if (!row?.image) return null;
  const bytes = row.image.startsWith("users/profiles/")
    ? await readMediaFile(row.image)
    : await privateStoragePhoto(row.image);
  return bytes ? new Response(new Uint8Array(bytes), { headers }) : null;
}
