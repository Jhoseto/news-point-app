import "server-only";
import { randomUUID } from "node:crypto";
import { eq } from "@newspoint/db/orm";
import { getDb, staffUsers } from "@newspoint/db";
import type { Staff } from "./session";
import { prepareProfilePhoto } from "./profile-photo-processing";

export const PROFILE_PHOTO_BUCKET = "studio-profile-images";

export async function deleteProfilePhoto(staff: Staff) {
  const db = getDb();
  const [user] = await db.select({ image: staffUsers.image }).from(staffUsers).where(eq(staffUsers.id, staff.id)).limit(1);
  await db.update(staffUsers).set({ image: null, updatedAt: new Date() }).where(eq(staffUsers.id, staff.id));
  if (user?.image) await removeObject(user.image);
  return { removed: true };
}

function storage() {
  const base = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!base || !key) throw new Error("storage unavailable");
  return { base: `${base}/storage/v1`, headers: { apikey: key, Authorization: `Bearer ${key}` } };
}

async function privateBucket() {
  const config = storage();
  const response = await fetch(`${config.base}/bucket/${PROFILE_PHOTO_BUCKET}`, { headers: config.headers, cache: "no-store", signal: AbortSignal.timeout(10_000) });
  if (!response.ok || (await response.json()).public !== false) throw new Error("private storage unavailable");
  return config;
}

async function removeObject(path: string | null) {
  if (!path) return;
  const config = storage();
  await fetch(`${config.base}/object/${PROFILE_PHOTO_BUCKET}`, { method: "DELETE", headers: { ...config.headers, "content-type": "application/json" }, body: JSON.stringify({ prefixes: [path] }), cache: "no-store", signal: AbortSignal.timeout(15_000) });
}

export async function uploadProfilePhoto(staff: Staff, file: File) {
  const buffer = await prepareProfilePhoto(file);
  const config = await privateBucket();
  const path = `${staff.id}/${randomUUID()}.webp`;
  const response = await fetch(`${config.base}/object/${PROFILE_PHOTO_BUCKET}/${path}`, {
    method: "POST", headers: { ...config.headers, "content-type": "image/webp", "x-upsert": "false" }, body: new Uint8Array(buffer), cache: "no-store", signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error("Качването на снимката не беше успешно.");
  const db = getDb();
  const [current] = await db.select({ image: staffUsers.image }).from(staffUsers).where(eq(staffUsers.id, staff.id)).limit(1);
  try {
    await db.update(staffUsers).set({ image: path, updatedAt: new Date() }).where(eq(staffUsers.id, staff.id));
  } catch (error) {
    await removeObject(path);
    throw error;
  }
  if (current?.image && current.image !== path) void removeObject(current.image).catch(() => undefined);
  return { bytes: buffer.length };
}

export async function readProfilePhoto(staffId: string): Promise<Response | null> {
  const [user] = await getDb().select({ image: staffUsers.image }).from(staffUsers).where(eq(staffUsers.id, staffId)).limit(1);
  if (!user?.image) return null;
  const config = await privateBucket();
  const response = await fetch(`${config.base}/object/authenticated/${PROFILE_PHOTO_BUCKET}/${user.image}`, { headers: config.headers, cache: "no-store", signal: AbortSignal.timeout(15_000) });
  if (!response.ok) return null;
  return new Response(response.body, { headers: { "content-type": "image/webp", "cache-control": "private, no-store", "x-content-type-options": "nosniff" } });
}
