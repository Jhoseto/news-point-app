import "server-only";
import { createHash } from "node:crypto";
import { MAX_PHOTOS, MAX_PHOTO_BYTES } from "./photos";

export class SubmissionRequestError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export const MAX_SUBMISSION_BYTES = MAX_PHOTOS * MAX_PHOTO_BYTES + 128 * 1024;
const attempts = new Map<string, { count: number; until: number }>();
let active = 0;

/** Process-local guard for the current single local server; production needs a trusted proxy and shared limiter. */
export function reserveSubmission(request: Request): () => void {
  if (request.headers.get("origin") !== new URL(request.url).origin) throw new SubmissionRequestError("Заявката трябва да е от сайта.", 403);
  const now = Date.now();
  for (const [key, value] of attempts) if (value.until <= now) attempts.delete(key);
  const ip = request.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim() ?? "local";
  const key = createHash("sha256").update(ip).digest("hex");
  const entry = attempts.get(key) ?? { count: 0, until: now + 15 * 60_000 };
  if (entry.count >= 5 || (!attempts.has(key) && attempts.size >= 1000)) throw new SubmissionRequestError("Твърде много опити. Опитайте отново след 15 минути.", 429);
  if (active >= 2) throw new SubmissionRequestError("В момента се обработват други снимки. Опитайте след малко.", 429);
  entry.count++;
  attempts.set(key, entry);
  active++;
  let released = false;
  return () => { if (!released) { active--; released = true; } };
}

export async function readSubmission(request: Request): Promise<{ input: unknown; photos: File[] }> {
  const type = request.headers.get("content-type") ?? "";
  const multipart = type.toLowerCase().startsWith("multipart/form-data;");
  const json = /^application\/json(?:;|$)/i.test(type);
  if (!multipart && !json) throw new SubmissionRequestError("Неподдържан формат на заявката.", 415);
  const limit = multipart ? MAX_SUBMISSION_BYTES : 64 * 1024;
  if (Number(request.headers.get("content-length")) > limit) throw new SubmissionRequestError("Твърде голяма заявка.", 413);
  if (!request.body) throw new SubmissionRequestError("Празна заявка.");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; void reader.cancel().catch(() => {}); }, 90_000);
  try {
    while (true) {
      const part = await reader.read();
      if (timedOut) throw new SubmissionRequestError("Изпращането отне твърде дълго. Опитайте отново.", 408);
      if (part.done) break;
      size += part.value.byteLength;
      if (size > limit) { await reader.cancel(); throw new SubmissionRequestError("Твърде голяма заявка.", 413); }
      chunks.push(part.value);
    }
  } finally { clearTimeout(timer); reader.releaseLock(); }
  // Parsing happens only after the streamed byte limit has been enforced.
  const body = new Response(Buffer.concat(chunks), { headers: { "Content-Type": type } });
  try {
    if (json) return { input: await body.json(), photos: [] };
    const form = await body.formData();
    if ([...form.keys()].some(key => key !== "data" && key !== "photos") || form.getAll("data").length !== 1) throw new Error("unknown fields");
    const data = form.get("data");
    const photos = form.getAll("photos");
    if (typeof data !== "string" || Buffer.byteLength(data) > 64 * 1024 || photos.some(file => !(file instanceof File))) throw new Error("invalid fields");
    if (photos.length > MAX_PHOTOS) throw new SubmissionRequestError("Можете да прикачите най-много 5 снимки.");
    return { input: JSON.parse(data), photos: photos as File[] };
  } catch (error) {
    if (error instanceof SubmissionRequestError) throw error;
    throw new SubmissionRequestError("Невалидни данни във формата.");
  }
}
