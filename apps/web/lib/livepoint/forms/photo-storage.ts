import "server-only";
import { randomUUID } from "node:crypto";
import type { PreparedPhoto } from "./photo-processing";
import type { SubmissionPhoto } from "./photos";

export const PHOTO_BUCKET = "livepoint-submissions";
function storageConfig() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("storage unavailable");
  return { url: `${url.replace(/\/$/, "")}/storage/v1`, headers: { apikey: key, Authorization: `Bearer ${key}` } };
}

export async function removePhotos(photos: SubmissionPhoto[]): Promise<void> {
  if (!photos.length) return;
  const config = storageConfig();
  const response = await fetch(`${config.url}/object/${PHOTO_BUCKET}`, {
    method: "DELETE", headers: { ...config.headers, "Content-Type": "application/json" },
    body: JSON.stringify({ prefixes: photos.map(photo => photo.path) }),
    cache: "no-store", signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error("storage cleanup failed");
}

export async function uploadPhotos(photos: PreparedPhoto[]): Promise<SubmissionPhoto[]> {
  if (!photos.length) return [];
  const config = storageConfig();
  // Fail closed if somebody accidentally changes this bucket to public.
  const bucket = await fetch(`${config.url}/bucket/${PHOTO_BUCKET}`, { headers: config.headers, cache: "no-store", signal: AbortSignal.timeout(10_000) });
  if (!bucket.ok || (await bucket.json()).public !== false) throw new Error("private storage unavailable");
  const folder = randomUUID();
  const uploaded: SubmissionPhoto[] = [];
  try {
    for (const photo of photos) {
      const record: SubmissionPhoto = { bucket: PHOTO_BUCKET, path: `${folder}/${randomUUID()}.webp`, contentType: "image/webp", bytes: photo.buffer.length, width: photo.width, height: photo.height };
      // Include attempted object in cleanup: a response can time out after the write succeeds.
      uploaded.push(record);
      const response = await fetch(`${config.url}/object/${PHOTO_BUCKET}/${record.path}`, {
        method: "POST", headers: { ...config.headers, "Content-Type": "image/webp", "x-upsert": "false" },
        body: new Uint8Array(photo.buffer), cache: "no-store", signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) throw new Error("photo upload failed");
    }
    return uploaded;
  } catch (error) {
    try { await removePhotos(uploaded); } catch { console.error("LivePoint photo rollback failed", { paths: uploaded.map(photo => photo.path) }); }
    throw error;
  }
}
