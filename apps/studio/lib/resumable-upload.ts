"use client";
import { sha256 } from "@noble/hashes/sha2.js";
import { withBase } from "./paths";
const CHUNK = 4 * 1024 * 1024;
const activeUploads = new Map<string, AbortController>();
type FileKey = "video" | "audio" | "cover";
type Metadata = { id?: string; revision?: number; title?: string; summary?: string; categoryId?: string | null; publish?: boolean };
type Status = { id: string; state: string; manifest: Array<{ key: FileKey; name: string; bytes: number; type: string; sha256: string }>; metadata: Metadata; chunks: Array<{ fileKey: string; index: number; sha256: string }>; result: Record<string, unknown> | null; error: string | null };
export type UploadProgress = (message: string) => void;
function storageKey(kind: string, id?: string) { return `np-upload:${kind}:${id || "new"}`; }
function stored(key: string) { try { return localStorage.getItem(key); } catch { return null; } }
function remember(key: string, id: string | null) { try { if (id) localStorage.setItem(key, id); else localStorage.removeItem(key); } catch { /* Resume remains possible until this page closes. */ } }
async function api(path: string, init: RequestInit = {}, signal?: AbortSignal): Promise<Status & Record<string, any>> {
 const controller = new AbortController();
 const abort = () => controller.abort(signal?.reason || new Error("Качването е отменено."));
 if (signal?.aborted) abort(); else signal?.addEventListener("abort", abort, { once: true });
 const timer = setTimeout(() => controller.abort(new Error("Сървърът не отговори навреме. Опитайте отново със същите файлове.")), 100_000);
 try {
  const response = await fetch(withBase(`/api/uploads/${path}`), { ...init, cache: "no-store", signal: controller.signal });
  let data: Record<string, any>;
  try { data = await response.json(); } catch { throw controller.signal.aborted ? controller.signal.reason : new Error("Сървърът не потвърди отговора. Опитайте отново със същите файлове."); }
  if (!response.ok) { const error = new Error(data.error?.message || (response.status === 401 ? "Сесията изтече. Влезте отново, после продължете качването." : "Качването е прекъснато. Опитайте отново със същите файлове.")) as Error & { status?: number; retryAfter?: number }; error.status = response.status; error.retryAfter = Math.min(10, Math.max(1, Number(response.headers.get("retry-after")) || 1)); throw error; }
  return data as Status & Record<string, any>;
 } finally { clearTimeout(timer); signal?.removeEventListener("abort", abort); }
}
function stable(value: unknown): string { if (Array.isArray(value)) return "[" + value.map(stable).join(",") + "]"; if (value && typeof value === "object") return "{" + Object.entries(value).sort(([a],[b]) => a.localeCompare(b)).map(([k,v]) => JSON.stringify(k) + ":" + stable(v)).join(",") + "}"; return JSON.stringify(value); }
function hex(bytes: Uint8Array) { return Array.from(bytes, b => b.toString(16).padStart(2, "0")).join(""); }
async function fileDigest(file: File, progress: UploadProgress, signal: AbortSignal): Promise<string> {
 const hash = sha256.create();
 for (let offset = 0; offset < file.size; offset += CHUNK) { signal.throwIfAborted(); hash.update(new Uint8Array(await file.slice(offset, offset + CHUNK).arrayBuffer())); progress(`Проверка на ${file.name}: ${Math.round(Math.min(file.size, offset + CHUNK) / file.size * 100)}%`); await new Promise(resolve => setTimeout(resolve, 0)); }
 return hex(hash.digest());
}
export async function cancelResumableUpload(kind: "video" | "podcast", id?: string) {
 const key = storageKey(kind, id); activeUploads.get(key)?.abort(new Error("Качването е отменено.")); const session = stored(key); if (!session) return;
 await api(`${session}/`, { method: "DELETE" }); remember(key, null);
}
/** No request exceeds4MiB. Reselect identical files after reload to resume verified parts. */
export async function uploadResumable(kind: "video" | "podcast", files: Array<{ key: FileKey; file: File }>, metadata: Metadata, progress: UploadProgress = () => undefined): Promise<Record<string, any>> {
 const key = storageKey(kind, metadata.id); const controller = new AbortController(); activeUploads.set(key, controller); const signal = controller.signal;
 try {
 for (const item of files) { const max = (item.key === "video" ? 200 : item.key === "audio" ? 100 : 25) * 1024 ** 2; if (!item.file.size || item.file.size > max) throw new Error(`Файлът трябва да е между 1 байт и ${max / 1024 ** 2} MiB.`); }
 const manifest = [];
 for (const { key: fileKey, file } of files) manifest.push({ key: fileKey, name: file.name, bytes: file.size, type: file.type || (fileKey === "video" ? ({ mp4: "video/mp4", mov: "video/quicktime", mkv: "video/x-matroska", webm: "video/webm" }[file.name.split(".").pop()?.toLowerCase() || ""] || "") : fileKey === "cover" ? "image/unknown" : "audio/unknown"), sha256: await fileDigest(file, progress, signal) });
 let session: Status | null = null; const previous = stored(key);
 if (previous) {
  try {
   session = await api(`${previous}/`, {}, signal);
   if (["failed", "cancelled", "expired"].includes(session.state)) { remember(key, null); session = null; }
   else if (stable(session.manifest) !== stable(manifest) || stable(session.metadata) !== stable(metadata)) throw new Error("Има друго незавършено качване. Отменете го или изберете същите файлове и данни.");
  } catch (error) { if ([404,410].includes((error as { status?: number }).status || 0)) { remember(key, null); session = null; } else throw error; }
 }
 signal.throwIfAborted();
 if (!session) { session = await api("", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind, files: manifest, metadata }) }); remember(key, session.id); }
 const id = session.id;
 if (signal.aborted) { await api(`${id}/`, { method: "DELETE" }).catch(() => undefined); remember(key, null); signal.throwIfAborted(); }
 if (session.state === "uploading") {
  let sent = 0; const total = files.reduce((sum, f) => sum + f.file.size, 0);
  for (const { key: fileKey, file } of files) for (let index = 0; index < Math.ceil(file.size / CHUNK); index++) {
   signal.throwIfAborted(); const bytes = new Uint8Array(await file.slice(index * CHUNK, (index + 1) * CHUNK).arrayBuffer()); const digest = hex(sha256(bytes));
   const old = session.chunks.find(c => c.fileKey === fileKey && c.index === index);
   if (old && old.sha256 !== digest) throw new Error("Избраният файл се различава от започнатото качване.");
   if (!old) {
    let attempt = 0;
    for (;;) { try { await api(`${id}/files/${fileKey}/chunks/${index}/`, { method: "PUT", headers: { "content-type": "application/octet-stream", "x-chunk-sha256": digest }, body: bytes }, signal); break; } catch (error) { const status = (error as { status?: number }).status; if (signal.aborted || ++attempt >= 4 || status && status < 500 && status !== 429) throw error; await new Promise(resolve => setTimeout(resolve, Math.min(10_000, status === 429 ? ((error as { retryAfter?: number }).retryAfter || 1) * 1000 : attempt * 1000))); } }
   }
   sent += bytes.length; progress(`Качване: ${Math.round(sent / total * 100)}%`);
  }
  await api(`${id}/complete/`, { method: "POST" }, signal);
 }
 progress("Файловете са получени. Обработка във фонов режим…");
 const started = Date.now();
 for (;;) {
  signal.throwIfAborted(); const state = await api(`${id}/`, {}, signal);
  if (state.state === "ready") { remember(key, null); return state.result || {}; }
  if (["failed", "cancelled", "expired"].includes(state.state)) { remember(key, null); throw new Error(state.error || "Качването е отменено или изтекло."); }
  if (Date.now() - started > 20 * 60_000) throw new Error("Обработката продължава. Изберете същите файлове и проверете отново.");
  await new Promise(resolve => setTimeout(resolve, 1500));
 }
 } finally { if (activeUploads.get(key) === controller) activeUploads.delete(key); }
}
