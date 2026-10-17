import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, stat, statfs, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve, sep } from "node:path";
import { and, asc, eq, gt, inArray, isNull, isNotNull, lt, or, sql } from "drizzle-orm";
import { z } from "zod";
import { removeMediaFile } from "@newspoint/content/upload-media";
import type { ScriptDb } from "./node";
import { findRepoRoot } from "./env";
import { mediaUploadChunks, mediaUploadSessions } from "./schema";

export const UPLOAD_CHUNK_BYTES = 4 * 1024 * 1024;
export const UPLOAD_TTL_MS = 24 * 60 * 60_000;
export const UPLOAD_QUOTA_BYTES = 2 * 1024 * 1024 * 1024;
const active = ["uploading", "queued", "processing"] as const;
export class MediaUploadError extends Error { constructor(public status: number, public code: string, message: string) { super(message); } }
const digest = z.string().regex(/^[0-9a-f]{64}$/);
export const uploadIntent = z.object({
 kind: z.enum(["video", "podcast"]),
 files: z.array(z.object({ key: z.enum(["video", "audio", "cover"]), name: z.string().min(1).max(240), bytes: z.number().int().positive(), type: z.string().max(100), sha256: digest }).strict()).min(1).max(2),
 metadata: z.object({ id: z.uuid().optional(), revision: z.number().int().positive().optional(), title: z.string().trim().min(2).max(180).optional(), summary: z.string().trim().min(1).max(600).optional(), categoryId: z.uuid().nullable().optional(), publish: z.boolean().optional() }).strict(),
}).strict().superRefine((x, ctx) => {
 const keys = x.files.map(f => f.key);
 if (new Set(keys).size !== keys.length) ctx.addIssue({ code: "custom", message: "Повторен файл." });
 for (const f of x.files) {
  const max = f.key === "video" ? 200 * 1024 ** 2 : f.key === "audio" ? 100 * 1024 ** 2 : 25 * 1024 ** 2;
  if (f.bytes > max) ctx.addIssue({ code: "custom", message: "Файлът надхвърля допустимия размер." });
 }
 if (x.kind === "video" && (keys.length !== 1 || keys[0] !== "video" || !/^video\/(mp4|quicktime|webm|x-matroska)$/.test(x.files[0]!.type))) ctx.addIssue({ code: "custom", message: "Изберете MP4, MOV, WebM или MKV." });
 if (x.kind === "podcast" && (keys.includes("video") || !x.metadata.title || !x.metadata.summary || (!x.metadata.id && (!keys.includes("audio") || !keys.includes("cover"))) || (x.metadata.id && !x.metadata.revision))) ctx.addIssue({ code: "custom", message: "Невалидни данни за епизода." });
 if (x.files.some(f => f.key === "audio" && !/\.(mp3|m4a|wav|flac)$/i.test(f.name) || f.key === "cover" && !f.type.startsWith("image/"))) ctx.addIssue({ code: "custom", message: "Неподдържан файл." });
});
export type UploadIntent = z.infer<typeof uploadIntent>;
export type UploadSession = typeof mediaUploadSessions.$inferSelect;
export function checksum(bytes: Uint8Array): string { return createHash("sha256").update(bytes).digest("hex"); }
export function chunkBytes(total: number, index: number): number {
 if (!Number.isInteger(index) || index < 0 || index >= Math.ceil(total / UPLOAD_CHUNK_BYTES)) throw new MediaUploadError(400, "chunk_index", "Невалидна част.");
 return Math.min(UPLOAD_CHUNK_BYTES, total - index * UPLOAD_CHUNK_BYTES);
}
/** Must be local durable storage shared by Studio and worker, NEVER under public MEDIA_ROOT. */
export function uploadTempRoot(): string {
 const media = process.env.MEDIA_ROOT?.trim();
 const configured = process.env.MEDIA_UPLOAD_TEMP_ROOT?.trim();
 if (!media || !isAbsolute(media) || configured && !isAbsolute(configured) || process.env.MEDIA_SSH_TARGET) throw new MediaUploadError(503, "upload_storage", "Качването изисква споделено локално хранилище за Studio и worker.");
 const root = resolve(/* turbopackIgnore: true */ configured || resolve(/* turbopackIgnore: true */ dirname(media), ".newspoint-upload-temp"));
 const publicRoot = resolve(/* turbopackIgnore: true */ media);
 const checkout = findRepoRoot();
 if (root === checkout || root.startsWith(checkout + sep)) throw new MediaUploadError(503, "upload_storage", "Временните файлове трябва да са извън приложението.");
 if (/(^|[\\/])(public|public_html|htdocs|www)([\\/]|$)/i.test(root) || root === publicRoot || root.startsWith(publicRoot.endsWith(sep) ? publicRoot : publicRoot + sep)) throw new MediaUploadError(503, "upload_storage", "Временните файлове трябва да са извън публичното хранилище.");
 return root;
}
export function uploadDirectory(id: string): string {
 if (!z.uuid().safeParse(id).success) throw new MediaUploadError(400, "upload_id", "Невалидно качване.");
 return resolve(/* turbopackIgnore: true */ uploadTempRoot(), id);
}
export function chunkPath(id: string, key: string, index: number): string {
 if (!["video", "audio", "cover"].includes(key) || !Number.isInteger(index) || index < 0 || index > 50) throw new MediaUploadError(400, "chunk_index", "Невалидна част.");
 return resolve(/* turbopackIgnore: true */ uploadDirectory(id), `${key}-${index}.part`);
}
export async function ensureUploadSpace(bytes: number) {
 const root = uploadTempRoot(); await mkdir(root, { recursive: true, mode: 0o700 });
 const [tempDevice, mediaDevice] = await Promise.all([stat(/* turbopackIgnore: true */ root), stat(/* turbopackIgnore: true */ process.env.MEDIA_ROOT!)]);
 if (tempDevice.dev !== mediaDevice.dev) throw new MediaUploadError(503, "upload_storage", "Временното и медийното хранилище трябва да са на една файлова система.");
 const fs = await statfs(root); const free = Number(fs.bavail) * Number(fs.bsize);
 if (free < bytes * 2 + 512 * 1024 ** 2) throw new MediaUploadError(507, "disk_space", "Няма достатъчно свободно място. Опитайте по-късно.");
}
export async function createMediaUpload(db: ScriptDb, ownerId: string, input: UploadIntent) {
 const parsed = uploadIntent.safeParse(input); if (!parsed.success) throw new MediaUploadError(400, "upload_intent", parsed.error.issues[0]?.message || "Невалидно качване.");
 const size = input.files.reduce((sum, f) => sum + f.bytes, 0) * 4 + 100 * 1024 ** 2; await ensureUploadSpace(size);
 return db.transaction(async tx => {
  // Serialize reservation across both processes and tabs; never trust client counters.
  await tx.execute(sql`select pg_advisory_xact_lock(180117, 37)`);
  const rows = await tx.select().from(mediaUploadSessions).where(isNull(mediaUploadSessions.cleanedAt));
  if (rows.filter(r => r.ownerId === ownerId && ([...active] as string[]).includes(r.state)).length >= 2) throw new MediaUploadError(429, "upload_sessions", "Имате две незавършени качвания. Продължете или отменете едно.");
  const totalReservation = rows.reduce((s, r) => s + r.reservedBytes, 0) + size;
  if (totalReservation > UPLOAD_QUOTA_BYTES) throw new MediaUploadError(429, "upload_quota", "Качванията временно достигнаха лимита. Опитайте по-късно.");
  await ensureUploadSpace(totalReservation);
  const id = randomUUID(); const [row] = await tx.insert(mediaUploadSessions).values({ id, ownerId, kind: input.kind, manifest: input.files, metadata: JSON.parse(JSON.stringify(input.metadata)) as UploadSession["metadata"], reservedBytes: size, expiresAt: new Date(Date.now() + UPLOAD_TTL_MS) }).returning();
  return row!;
 });
}
export async function ownMediaUpload(db: ScriptDb, ownerId: string, id: string) {
 if (!z.uuid().safeParse(id).success) throw new MediaUploadError(404, "upload_missing", "Качването не е намерено.");
 const [row] = await db.select().from(mediaUploadSessions).where(and(eq(mediaUploadSessions.id, id), eq(mediaUploadSessions.ownerId, ownerId))).limit(1);
 if (!row) throw new MediaUploadError(404, "upload_missing", "Качването не е намерено.");
 if (row.expiresAt.getTime() <= Date.now() || row.state === "expired") throw new MediaUploadError(410, "upload_expired", "Качването изтече. Изберете файловете отново.");
 return row;
}
export async function mediaUploadStatus(db: ScriptDb, ownerId: string, id: string) {
 const row = await ownMediaUpload(db, ownerId, id);
 const chunks = await db.select({ fileKey: mediaUploadChunks.fileKey, index: mediaUploadChunks.chunkIndex, sha256: mediaUploadChunks.sha256 }).from(mediaUploadChunks).where(eq(mediaUploadChunks.sessionId, id));
 return { id: row.id, kind: row.kind, state: row.state, expiresAt: row.expiresAt.toISOString(), manifest: row.manifest, metadata: row.metadata, chunks, result: row.result, error: row.error, chunkBytes: UPLOAD_CHUNK_BYTES };
}
export async function putMediaChunk(db: ScriptDb, ownerId: string, id: string, key: string, index: number, hash: string, bytes: Buffer) {
 if (!z.uuid().safeParse(id).success) throw new MediaUploadError(404, "upload_missing", "Качването не е намерено.");
 if (!digest.safeParse(hash).success || checksum(bytes) !== hash) throw new MediaUploadError(422, "chunk_checksum", "Частта е повредена. Опитайте отново.");
 return db.transaction(async tx => {
  const [row] = await tx.select().from(mediaUploadSessions).where(and(eq(mediaUploadSessions.id, id), eq(mediaUploadSessions.ownerId, ownerId))).for("update");
  if (!row) throw new MediaUploadError(404, "upload_missing", "Качването не е намерено.");
  if (row.expiresAt.getTime() <= Date.now()) throw new MediaUploadError(410, "upload_expired", "Качването изтече.");
  const file = row.manifest.find(f => f.key === key);
  if (!file || bytes.length !== chunkBytes(file.bytes, index)) throw new MediaUploadError(400, "chunk_size", "Невалидна дължина на частта.");
  const [existing] = await tx.select().from(mediaUploadChunks).where(and(eq(mediaUploadChunks.sessionId, id), eq(mediaUploadChunks.fileKey, key), eq(mediaUploadChunks.chunkIndex, index)));
  if (existing) {
   if (existing.sha256 !== hash || existing.bytes !== bytes.length) throw new MediaUploadError(409, "chunk_conflict", "Вече е записана различна част. Започнете ново качване.");
   return { ok: true, duplicate: true };
  }
  if (row.state !== "uploading") throw new MediaUploadError(409, "upload_state", "Качването вече е приключено или отменено.");
  await ensureUploadSpace(bytes.length); const directory = uploadDirectory(id); await mkdir(directory, { recursive: true, mode: 0o700 });
  const path = chunkPath(id, key, index); const temp = `${path}.${randomUUID()}.tmp`;
  try { await writeFile(temp, bytes, { mode: 0o600 }); await rename(temp, path); } finally { await rm(temp, { force: true }); }
  await tx.insert(mediaUploadChunks).values({ sessionId: id, fileKey: key, chunkIndex: index, bytes: bytes.length, sha256: hash });
  await tx.update(mediaUploadSessions).set({ updatedAt: new Date() }).where(eq(mediaUploadSessions.id, id));
  return { ok: true, duplicate: false };
 });
}
export async function completeMediaUpload(db: ScriptDb, ownerId: string, id: string) {
 await ownMediaUpload(db, ownerId, id);
 return db.transaction(async tx => {
  const [row] = await tx.select().from(mediaUploadSessions).where(and(eq(mediaUploadSessions.id, id), eq(mediaUploadSessions.ownerId, ownerId))).for("update");
  if (!row || row.expiresAt.getTime() <= Date.now()) throw new MediaUploadError(410, "upload_expired", "Качването изтече.");
  if (["queued", "processing", "ready"].includes(row.state)) return { ok: true, state: row.state };
  if (row.state !== "uploading") throw new MediaUploadError(409, "upload_state", "Качването е отменено или неуспешно.");
  const chunks = await tx.select().from(mediaUploadChunks).where(eq(mediaUploadChunks.sessionId, id));
  for (const file of row.manifest) for (let i = 0; i < Math.ceil(file.bytes / UPLOAD_CHUNK_BYTES); i++) if (!chunks.some(c => c.fileKey === file.key && c.chunkIndex === i && c.bytes === chunkBytes(file.bytes, i))) throw new MediaUploadError(409, "upload_incomplete", "Липсват части от файла. Продължете качването.");
  await tx.update(mediaUploadSessions).set({ state: "queued", updatedAt: new Date() }).where(eq(mediaUploadSessions.id, id));
  return { ok: true, state: "queued" };
 });
}
export async function cancelMediaUpload(db: ScriptDb, ownerId: string, id: string) {
 await ownMediaUpload(db, ownerId, id);
 return db.transaction(async tx => {
  const [row] = await tx.select().from(mediaUploadSessions).where(and(eq(mediaUploadSessions.id, id), eq(mediaUploadSessions.ownerId, ownerId))).for("update");
  if (!row) throw new MediaUploadError(404, "upload_missing", "Качването не е намерено.");
  if (row.state === "ready") throw new MediaUploadError(409, "upload_committed", "Качването вече е завършено. Проверете резултата.");
  const liveLease = Boolean(row.leaseUntil && row.leaseUntil.getTime() > Date.now());
  await tx.update(mediaUploadSessions).set({ state: "cancelled", updatedAt: new Date(), ...(liveLease ? {} : { leaseToken: null, leaseUntil: null }) }).where(eq(mediaUploadSessions.id, id));
  // No worker holds these files yet. Processing jobs are fenced and cleaned after bounded codec completion.
  if (!liveLease) { await rm(uploadDirectory(id), { recursive: true, force: true }); await tx.update(mediaUploadSessions).set({ cleanedAt: new Date() }).where(eq(mediaUploadSessions.id, id)); }
  return { ok: true };
 });
}export async function claimMediaUpload(db: ScriptDb): Promise<UploadSession | null> {
 return db.transaction(async tx => {
  await tx.execute(sql`select pg_advisory_xact_lock(180117, 38)`);
  const now = new Date();
  const busy = await tx.select({ id: mediaUploadSessions.id }).from(mediaUploadSessions).where(gt(mediaUploadSessions.leaseUntil, now)).limit(1);
  if (busy.length) return null;
  const [row] = await tx.select().from(mediaUploadSessions).where(and(isNotNull(mediaUploadSessions.ownerId), gt(mediaUploadSessions.expiresAt, now), or(eq(mediaUploadSessions.state, "queued"), and(eq(mediaUploadSessions.state, "processing"), lt(mediaUploadSessions.leaseUntil, now))))).orderBy(asc(mediaUploadSessions.createdAt)).limit(1).for("update", { skipLocked: true });
  if (!row) return null;
  if (row.attempts >= 3) { await tx.update(mediaUploadSessions).set({ state: "failed", error: "Обработката беше прекъсвана многократно. Изберете файловете отново." }).where(eq(mediaUploadSessions.id, row.id)); return null; }
  const [claimed] = await tx.update(mediaUploadSessions).set({ state: "processing", attempts: row.attempts + 1, leaseToken: randomUUID(), leaseUntil: new Date(Date.now() + 15 * 60_000), updatedAt: now }).where(eq(mediaUploadSessions.id, row.id)).returning();
  return claimed!;
 });
}
export async function cleanExpiredUploads(db: ScriptDb) {
 const rows = await db.select().from(mediaUploadSessions).where(or(lt(mediaUploadSessions.expiresAt, new Date()), isNull(mediaUploadSessions.ownerId), and(inArray(mediaUploadSessions.state, ["failed", "cancelled", "ready"]), isNull(mediaUploadSessions.cleanedAt))));
 for (const row of rows) await db.transaction(async tx => {
  const [current] = await tx.select().from(mediaUploadSessions).where(eq(mediaUploadSessions.id, row.id)).for("update");
  if (!current || current.leaseUntil && current.leaseUntil.getTime() > Date.now()) return;
  if (current.ownerId && current.expiresAt.getTime() > Date.now() && !["failed", "cancelled", "ready"].includes(current.state)) return;
  // Only generated attempt keys are eligible; committed result keys remain permanent.
  const result = current.result as { url?: string; episode?: { coverKey?: string; audioKey?: string } } | null;
  const keep = new Set(current.state === "ready" ? [result?.url?.replace(/^\/media\//, ""), result?.episode?.coverKey, result?.episode?.audioKey] : []);
  for (const artifact of current.artifacts) if (!keep.has(artifact.key)) await removeMediaFile(artifact.key);
  await rm(uploadDirectory(current.id), { recursive: true, force: true });
  if (!current.ownerId || current.expiresAt.getTime() <= Date.now()) await tx.delete(mediaUploadSessions).where(eq(mediaUploadSessions.id, current.id));
  else await tx.update(mediaUploadSessions).set({ cleanedAt: new Date(), leaseToken: null, leaseUntil: null }).where(eq(mediaUploadSessions.id, current.id));
 });
}
export async function readUploadPart(id: string, file: UploadSession["manifest"][number], index: number, expected: string) {
 const bytes = await readFile(chunkPath(id, file.key, index));
 if (bytes.length !== chunkBytes(file.bytes, index) || checksum(bytes) !== expected) throw new MediaUploadError(422, "stored_checksum", "Записаната част е повредена. Изберете файловете отново.");
 return bytes;
}
