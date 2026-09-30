import { randomBytes, randomUUID } from "node:crypto";
import { PODCAST_AUDIO_MAX_BYTES, inspectMp3, podcastSlug } from "@newspoint/content";
import { insertPodcast, podcastsReady } from "@newspoint/db/podcasts";
import { staffFromRequest } from "@/lib/session";
import { studioOrigins } from "@/lib/auth";
import { removeMediaFile, writeMediaFile } from "@/lib/media-disk";
import { prepareUploadedPhoto, UPLOADED_PHOTO_MAX_BYTES } from "@/lib/uploaded-photo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "cache-control": "private, no-store" } });
}

function storageKey(extension: "webp" | "mp3") {
  const now = new Date();
  return `podcasts/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${randomUUID()}.${extension}`;
}

export async function POST(request: Request) {
  if (!studioOrigins().trusted.includes(request.headers.get("origin") ?? "")) return json({ error: { message: "Заявката трябва да идва от Studio." } }, 403);
  const staff = await staffFromRequest(request);
  if (!staff) return json({ error: { message: "Влезте отново." } }, 401);
  if (!await podcastsReady()) return json({ error: { message: "Първо приложете миграция 22_podcasts.sql." } }, 503);
  const form = await request.formData();
  const title = String(form.get("title") ?? "").trim();
  const summary = String(form.get("summary") ?? "").trim();
  const categoryRaw = String(form.get("categoryId") ?? "").trim();
  const publish = form.get("publish") === "1";
  const cover = form.get("cover");
  const audio = form.get("audio");
  if (title.length < 2 || title.length > 180) return json({ error: { message: "Заглавието е от 2 до 180 знака." } }, 400);
  if (summary.length < 1 || summary.length > 600) return json({ error: { message: "Резюмето е до 600 знака." } }, 400);
  if (!(cover instanceof File) || !cover.type.startsWith("image/") || !(audio instanceof File)) return json({ error: { message: "Качете корица и MP3." } }, 400);
  if (cover.size > UPLOADED_PHOTO_MAX_BYTES) return json({ error: { message: "Снимката трябва да е до 25 MB." } }, 413);
  if (audio.size > PODCAST_AUDIO_MAX_BYTES) return json({ error: { message: "MP3 файлът трябва да е до 80 MB." } }, 413);
  const categoryId = categoryRaw ? categoryRaw : null;
  if (categoryId && !/^[0-9a-f-]{36}$/i.test(categoryId)) return json({ error: { message: "Невалидна рубрика." } }, 400);

  const audioBytes = Buffer.from(await audio.arrayBuffer());
  const inspected = inspectMp3(audioBytes);
  if (!inspected) return json({ error: { message: "Файлът не е валиден MP3." } }, 400);

  let coverKey = "";
  let audioKey = "";
  try {
    const photo = await prepareUploadedPhoto(Buffer.from(await cover.arrayBuffer()));
    coverKey = storageKey("webp");
    audioKey = storageKey("mp3");
    await writeMediaFile(coverKey, photo.buffer);
    await writeMediaFile(audioKey, audioBytes);
    const slug = podcastSlug(title, randomBytes(3).toString("hex"));
    const row = await insertPodcast({
      title, slug, summary, coverKey, audioKey,
      durationSec: inspected.durationSec,
      bytes: audioBytes.length,
      categoryId,
      status: publish ? "published" : "draft",
      createdBy: staff.id,
    });
    return json({ id: row.id, slug: row.slug });
  } catch (error) {
    if (coverKey) await removeMediaFile(coverKey).catch(() => undefined);
    if (audioKey) await removeMediaFile(audioKey).catch(() => undefined);
    const message = error instanceof Error && /Невалидна|снимка|корица/i.test(error.message) ? error.message : "Качването не мина. Проверете корицата и MP3 файла.";
    return json({ error: { message } }, 400);
  }
}
