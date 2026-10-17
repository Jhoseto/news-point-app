import { randomUUID, createHash } from "node:crypto";
import { appendFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { and, eq, gt, inArray, sql } from "drizzle-orm";
import { claimMediaUpload, cleanExpiredUploads, readUploadPart, UPLOAD_CHUNK_BYTES, uploadDirectory, type UploadSession } from "@newspoint/db/media-uploads";
import { mediaAssets, mediaUploadChunks, mediaUploadSessions, podcasts, staffUsers, studioAuditLogs, type ScriptDb } from "@newspoint/db/node";
import { optimizeVideo, prepareUploadedPhoto, removeMediaFile, writeMediaFile, writeMediaFromFile } from "@newspoint/content/upload-media";
import { preparePodcastAudio } from "@newspoint/content/audio";
import { podcastSlug } from "@newspoint/content";

/** One durable media job across workers; fifteen-minute lease, renewed every30s. */
export async function processOneMediaUpload(db: ScriptDb): Promise<boolean> {
 const row = await claimMediaUpload(db); if (!row) return false;
 const created: string[] = [];
 const token = row.leaseToken!;
 const heartbeat = setInterval(() => { void db.update(mediaUploadSessions).set({ leaseUntil: new Date(Date.now() + 15 * 60_000), updatedAt: new Date() }).where(and(eq(mediaUploadSessions.id, row.id), eq(mediaUploadSessions.leaseToken, token), eq(mediaUploadSessions.state, "processing"), gt(mediaUploadSessions.leaseUntil, new Date()))).catch(error => console.error("[media-upload] lease renewal failed", error instanceof Error ? error.message : "unknown")); }, 30_000);
 let committed = false;
 try {
  const attemptDirectory = resolve(uploadDirectory(row.id), token);
  await mkdir(attemptDirectory, { recursive: true, mode: 0o700 });
  if (!row.ownerId) throw new Error("Upload owner missing");
  const paths = await assemble(db, row, attemptDirectory);
  const stamp = row.createdAt;
  const base = `${stamp.getUTCFullYear()}/${String(stamp.getUTCMonth() + 1).padStart(2, "0")}/${token}`;
  let result: Record<string, unknown>;
  if (row.kind === "video") {
   const output = resolve(attemptDirectory, "optimized.mp4");
   const info = await optimizeVideo(paths.video!, output); const key = `news/${base}.mp4`; created.push(key); await registerArtifact(db, row.id, token, key); await writeMediaFromFile(key, output, attemptDirectory);
   result = { id: row.id, url: `/media/${key}`, ...info };
   await commit(db, row, token, async tx => {
    await tx.insert(mediaAssets).values({ id: row.id, provider: "object_storage", storageKey: key, mime: "video/mp4", width: info.width, height: info.height, alt: row.manifest[0]!.name });
    return result;
   });
  } else {
   const metadata = row.metadata;
   const [existing] = metadata.id ? await db.select().from(podcasts).where(eq(podcasts.id, metadata.id)).limit(1) : [];
   if (metadata.id && (!existing || existing.revision !== metadata.revision)) throw new Error("Епизодът е променен от друг редактор. Презаредете преди нов запис.");
   const audioFile = row.manifest.find(f => f.key === "audio");
   const audio = paths.audio ? await preparePodcastAudio(await readFile(paths.audio), audioFile!.name, { tempRoot: attemptDirectory }) : null;
   const cover = paths.cover ? await prepareUploadedPhoto(await readFile(paths.cover)) : null;
   const coverKey = cover ? `podcasts/${base}.webp` : existing!.coverKey;
   const audioKey = audio ? `podcasts/${base}.${audio.extension}` : existing!.audioKey;
   if (cover) { created.push(coverKey); await registerArtifact(db, row.id, token, coverKey); await writeMediaFile(coverKey, cover.buffer, attemptDirectory); }
   if (audio) { created.push(audioKey); await registerArtifact(db, row.id, token, audioKey); await writeMediaFile(audioKey, audio.buffer, attemptDirectory); }
   await commit(db, row, token, async tx => {
    const now = new Date();
    const values = { title: metadata.title!, summary: metadata.summary!, categoryId: metadata.categoryId || null, coverKey, audioKey, durationSec: audio?.durationSec ?? existing!.durationSec, bytes: audio?.buffer.length ?? existing!.bytes, updatedAt: now };
    const [episode] = existing
     ? await tx.update(podcasts).set({ ...values, revision: sql`${podcasts.revision} + 1` }).where(and(eq(podcasts.id, existing.id), eq(podcasts.revision, metadata.revision!))).returning()
     : await tx.insert(podcasts).values({ ...values, id: row.id, slug: podcastSlug(metadata.title!, row.id.slice(0, 6)), status: metadata.publish ? "published" : "draft", publishedAt: metadata.publish ? now : null, createdBy: row.ownerId }).returning();
    if (!episode) throw new Error("Епизодът е променен от друг редактор. Презаредете преди нов запис.");
    result = { id: episode.id, slug: episode.slug, episode: { ...episode, publishedAt: episode.publishedAt?.toISOString() ?? null, createdAt: episode.createdAt.toISOString(), updatedAt: episode.updatedAt.toISOString() }, ...(audio ? { audioOptimization: { originalBytes: audio.originalBytes, storedBytes: audio.buffer.length, savedBytes: audio.originalBytes - audio.buffer.length } } : {}) };
    return result;
   });
  }
  committed = true;
  await rm(uploadDirectory(row.id), { recursive: true, force: true });
  await db.update(mediaUploadSessions).set({ cleanedAt: new Date() }).where(and(eq(mediaUploadSessions.id, row.id), eq(mediaUploadSessions.state, "ready")));
  // Public web reads fresh data; route revalidation is best effort, never undoes the durable commit.
  if (row.kind === "podcast") await refreshPublicPodcast().catch(error => console.error("[media-upload] refresh", error instanceof Error ? error.message : "unknown"));
 } catch (error) {
  if (!committed) {
   // COMMIT may have succeeded even if its acknowledgement was lost. Never delete on uncertainty.
   let knownNotCommitted = false;
   try { const [current] = await db.select().from(mediaUploadSessions).where(eq(mediaUploadSessions.id, row.id)).limit(1); committed = current?.state === "ready"; knownNotCommitted = Boolean(current && current.state !== "ready"); } catch { /* Durable artifact journal lets a later cleaner decide. */ }
   if (!knownNotCommitted) return true;
   for (const key of created) await removeMediaFile(key).catch(() => undefined);
   const safe = error instanceof Error && /Епизодът|снимка|Качете|Невалид|Неподдържан|Видеото|Оптимизиран|повредена/.test(error.message) ? error.message : "Обработката не успя. Проверете файла и опитайте отново.";
   await db.update(mediaUploadSessions).set({ state: "failed", error: safe, leaseUntil: null, leaseToken: null, updatedAt: new Date() }).where(and(eq(mediaUploadSessions.id, row.id), eq(mediaUploadSessions.leaseToken, token), eq(mediaUploadSessions.state, "processing")));
  } else console.error("[media-upload] cleanup after commit failed", error instanceof Error ? error.message : "unknown");
 } finally { clearInterval(heartbeat); await db.update(mediaUploadSessions).set({ leaseUntil: null, leaseToken: null }).where(and(eq(mediaUploadSessions.id, row.id), eq(mediaUploadSessions.leaseToken, token), inArray(mediaUploadSessions.state, ["cancelled", "failed"]))).catch(() => undefined); await rm(resolve(uploadDirectory(row.id), token), { recursive: true, force: true }).catch(() => undefined); }
 return true;
}
type Tx = Parameters<Parameters<ScriptDb["transaction"]>[0]>[0];
async function commit(db: ScriptDb, row: UploadSession, token: string, produce: (tx: Tx) => Promise<Record<string, unknown>>) {
 await db.transaction(async tx => {
  const [current] = await tx.select().from(mediaUploadSessions).where(eq(mediaUploadSessions.id, row.id)).for("update");
  const [owner] = row.ownerId ? await tx.select({ role: staffUsers.role }).from(staffUsers).where(eq(staffUsers.id, row.ownerId)).limit(1) : [];
  if (!owner || !["editor", "admin", "master_admin"].includes(String(owner.role))) throw new Error("Upload owner permission changed");
  if (!current || current.ownerId !== row.ownerId || current.state !== "processing" || current.leaseToken !== token || current.expiresAt.getTime() <= Date.now() || !current.leaseUntil || current.leaseUntil.getTime() <= Date.now()) throw new Error("Upload cancelled or lease lost");
  const result = await produce(tx);
  await tx.update(mediaUploadSessions).set({ state: "ready", result, error: null, leaseToken: null, leaseUntil: null, updatedAt: new Date() }).where(eq(mediaUploadSessions.id, row.id));
  const now = new Date();
  await tx.insert(studioAuditLogs).values({ id: randomUUID(), startedAt: row.createdAt, occurredAt: now, actorId: row.ownerId, area: "media", action: "upload_complete", actionLabel: "Завършено качване", entityKind: row.kind, entityId: String(result.id || row.id), entityLabel: row.metadata.title || row.manifest[0]!.name, outcome: "success", method: "WORKER", path: `/api/uploads/${row.id}/`, statusCode: 200, durationMs: now.getTime() - row.createdAt.getTime(), details: { uploadId: row.id, kind: row.kind }, searchText: `upload ${row.kind} ${row.id}` });
 });
}
async function assemble(db: ScriptDb, row: UploadSession, attemptDirectory: string): Promise<Partial<Record<"video" | "audio" | "cover", string>>> {
 const chunks = await db.select().from(mediaUploadChunks).where(eq(mediaUploadChunks.sessionId, row.id));
 const paths: Partial<Record<"video" | "audio" | "cover", string>> = {};
 for (const file of row.manifest) {
  const path = resolve(attemptDirectory, `assembled-${file.key}`); paths[file.key] = path;
  await writeFile(path, Buffer.alloc(0), { mode: 0o600 }); const hash = createHash("sha256");
  for (let index = 0; index < Math.ceil(file.bytes / UPLOAD_CHUNK_BYTES); index++) {
   const chunk = chunks.find(c => c.fileKey === file.key && c.chunkIndex === index); if (!chunk) throw new Error("Липсва част.");
   const bytes = await readUploadPart(row.id, file, index, chunk.sha256); hash.update(bytes); await appendFile(path, bytes);
  }
  if (hash.digest("hex") !== file.sha256) throw new Error("Невалидна контролна сума на файла. Изберете файловете отново.");
 }
 return paths;
}
async function refreshPublicPodcast() {
 const origin = process.env.WEB_URL?.trim(); const secret = process.env.REVALIDATE_SECRET?.trim();
 if (!origin || !secret) return;
 const response = await fetch(new URL("/api/revalidate/", origin), { method: "POST", signal: AbortSignal.timeout(5000), headers: { "content-type": "application/json", "x-revalidate-secret": secret }, body: JSON.stringify({ paths: ["/", "/livepoint/podcast/"] }) });
 if (!response.ok) throw new Error(`HTTP ${response.status}`);
}
export { cleanExpiredUploads };






async function registerArtifact(db: ScriptDb, id: string, token: string, key: string) {
 const [row] = await db.update(mediaUploadSessions).set({ artifacts: sql`${mediaUploadSessions.artifacts} || ${JSON.stringify([{ key, leaseToken: token }])}::jsonb` }).where(and(eq(mediaUploadSessions.id, id), eq(mediaUploadSessions.leaseToken, token), eq(mediaUploadSessions.state, "processing"), gt(mediaUploadSessions.leaseUntil, new Date()))).returning({ id: mediaUploadSessions.id });
 if (!row) throw new Error("Upload lease lost before write");
}
