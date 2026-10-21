import { getDb } from "@newspoint/db";
import { cancelMediaUpload, completeMediaUpload, createMediaUpload, mediaUploadStatus, MediaUploadError, putMediaChunk, UPLOAD_CHUNK_BYTES, uploadIntent } from "@newspoint/db/media-uploads";
import { staffFromRequest } from "./session";
import { studioOrigins } from "./auth";
import { auditFacts } from "./audit-context";

export async function mediaUploadAPI(request: Request, parts: string[] = []) {
 const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "private, no-store" } });
 try {
  const origin = request.headers.get("origin");
  if (request.method !== "GET" && !studioOrigins().trusted.includes(origin ?? "") || origin && !studioOrigins().trusted.includes(origin)) return json({ error: { message: "Невалиден източник." } }, 403);
  const staff = await staffFromRequest(request); if (!staff) return json({ error: { message: "Влезте отново." } }, 401);
  if (!["editor", "admin", "master_admin"].includes(staff.role)) return json({ error: { message: "Нямате права." } }, 403);
  const db = getDb(); const [id, action, fileId, chunksPart, index] = parts;
  if (!id && request.method === "POST") {
   const text = await boundedBody(request, 16 * 1024); const parsed = uploadIntent.safeParse(JSON.parse(text.toString()));
   if (!parsed.success) return json({ error: { message: parsed.error.issues[0]?.message || "Невалидно качване." } }, 400);
   const row = await createMediaUpload(db, staff.id, parsed.data); auditFacts({ uploadId: row.id, uploadKind: row.kind, reservedBytes: row.reservedBytes });
   return json(await mediaUploadStatus(db, staff.id, row.id), 201);
  }
  if (parts.length === 1 && request.method === "GET") return json(await mediaUploadStatus(db, staff.id, id!));
  if (parts.length === 1 && request.method === "DELETE") { auditFacts({ uploadId: id! }); return json(await cancelMediaUpload(db, staff.id, id!)); }
  if (parts.length === 2 && action === "cancel" && request.method === "POST") { auditFacts({ uploadId: id! }); return json(await cancelMediaUpload(db, staff.id, id!)); }
  if (parts.length === 2 && action === "complete" && request.method === "POST") { auditFacts({ uploadId: id! }); return json(await completeMediaUpload(db, staff.id, id!), 202); }
  if (parts.length === 5 && action === "files" && chunksPart === "chunks" && ["POST", "PUT"].includes(request.method)) {
   if (!/^\d+$/.test(index ?? "")) return json({ error: { message: "Невалидна част." } }, 400);
   const bytes = await boundedBody(request, UPLOAD_CHUNK_BYTES);
   return json(await putMediaChunk(db, staff.id, id!, fileId!, Number(index), request.headers.get("x-chunk-sha256") || "", bytes));
  }
  return json({ error: { message: "Неподдържан адрес." } }, 404);
 } catch (error) {
  if (error instanceof MediaUploadError) return json({ error: { code: error.code, message: error.message } }, error.status);
  if (error instanceof SyntaxError) return json({ error: { message: "Невалидни данни." } }, 400);
  console.error("[media-upload]", error instanceof Error ? error.message : "unknown");
  return json({ error: { message: "Качването временно не е достъпно. Проверете миграция37 и хранилището." } }, 503);
 }
}
export async function boundedBody(request: Request, max: number): Promise<Buffer> {
 const declared = request.headers.get("content-length"); if (declared && (!/^\d+$/.test(declared) || Number(declared) > max)) throw new MediaUploadError(413, "body_size", "Частта е твърде голяма.");
 const reader = request.body?.getReader(); if (!reader) return Buffer.alloc(0);
 const chunks: Uint8Array[] = []; let size = 0;
 let timer: ReturnType<typeof setTimeout> | undefined;
 const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => { reject(new MediaUploadError(408, "upload_timeout", "Получаването на частта се забави. Опитайте отново.")); void reader.cancel().catch(() => undefined); }, 90_000); });
 try {
  for (;;) { const { done, value } = await Promise.race([reader.read(), timeout]); if (done) break; size += value.length; if (size > max) { void reader.cancel().catch(() => undefined); throw new MediaUploadError(413, "body_size", "Частта е твърде голяма."); } chunks.push(value); }
  if (declared && Number(declared) !== size) throw new MediaUploadError(400, "body_size", "Частта е прекъсната. Опитайте отново.");
 } finally { clearTimeout(timer); reader.releaseLock(); }
 return Buffer.concat(chunks, size);
}
