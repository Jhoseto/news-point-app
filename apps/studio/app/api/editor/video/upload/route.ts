import { withStaffAudit } from "../../../../../lib/audit";
import { auditFacts } from "../../../../../lib/audit-context";
import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { eq } from "drizzle-orm";
import { getDb, mediaAssets } from "@newspoint/db";
import { studioOrigins } from "../../../../../lib/auth";
import { staffFromRequest } from "../../../../../lib/session";
import { removeMediaFile, writeMediaFromFile } from "../../../../../lib/media-disk";
import { acceptsVideoType, optimizeVideo, VIDEO_MAX_INPUT_BYTES } from "../../../../../lib/uploaded-video";

export const runtime = "nodejs";
let processing = false;

async function handlePOST(request: Request) {
  const headers = { "cache-control": "no-store" };
  if (!studioOrigins().trusted.includes(request.headers.get("origin") ?? "")) return Response.json({ error: { message: "Невалиден източник." } }, { status: 403, headers });
  const staff = await staffFromRequest(request);
  if (!staff) return Response.json({ error: { message: "Влезте отново." } }, { status: 401, headers });
  if (processing) return Response.json({ error: { message: "Вече се обработва видео. Опитайте след малко." } }, { status: 429, headers });
  const type = (request.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
  if (!acceptsVideoType(type) || !request.body) return Response.json({ error: { message: "Изберете MP4, MOV, WebM или MKV видео." } }, { status: 400, headers });
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > VIDEO_MAX_INPUT_BYTES) return Response.json({ error: { message: "Видеото трябва да е до 200 MB." } }, { status: 413, headers });
  processing = true;
  let work: string | null = null;
  let storageKey: string | null = null;
  let assetId: string | null = null;
  try {
    work = await mkdtemp(join(tmpdir(), "np-video-"));
    const source = join(work, "source");
    const output = join(work, "optimized.mp4");
    let uploaded = 0;
    await pipeline(
      Readable.fromWeb(request.body as Parameters<typeof Readable.fromWeb>[0]),
      new Transform({ transform(chunk: Buffer, _encoding, callback) {
        uploaded += chunk.length;
        callback(uploaded > VIDEO_MAX_INPUT_BYTES ? new Error("Видеото трябва да е до 200 MB.") : null, chunk);
      } }),
      createWriteStream(source),
    );
    if (uploaded < 1) throw new Error("Файлът е празен.");
    const video = await optimizeVideo(source, output);
    const now = new Date();
    storageKey = `news/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${randomUUID()}.mp4`;
    await writeMediaFromFile(storageKey, output);
    const name = decodeURIComponent(request.headers.get("x-video-name") ?? "Видео").replace(/[<>\u0000-\u001f\u007f]/g, " ").trim().slice(0, 240) || "Видео";
    const [asset] = await getDb().insert(mediaAssets).values({ provider: "object_storage", storageKey, mime: "video/mp4", width: video.width, height: video.height, alt: name }).returning({ id: mediaAssets.id });
    assetId = asset!.id;
    auditFacts({ fileName: name, uploadedBytes: uploaded, optimizedBytes: video.bytes, durationSeconds: video.duration, mediaAssetId: assetId });
    return Response.json({ id: assetId, url: `/media/${storageKey}`, duration: video.duration, bytes: video.bytes, width: video.width, height: video.height }, { headers });
  } catch (error) {
    if (assetId) await getDb().delete(mediaAssets).where(eq(mediaAssets.id, assetId)).catch(() => undefined);
    if (storageKey) await removeMediaFile(storageKey).catch(() => undefined);
    const message = error instanceof Error ? error.message : "";
    const known = ["Видеото трябва да е до 200 MB.", "Файлът е празен.", "Видеото трябва да е валидно и с продължителност до 5 минути.", "Оптимизираното видео е твърде голямо. Изберете по-кратък или по-лек клип."].includes(message);
    return Response.json({ error: { message: known ? message : "Обработката не успя. Проверете дали FFmpeg е наличен и опитайте отново." } }, { status: message.includes("200 MB") ? 413 : known ? 400 : 500, headers });
  } finally {
    if (work) await rm(work, { recursive: true, force: true }).catch(() => undefined);
    processing = false;
  }
}

export const POST = withStaffAudit(handlePOST);
