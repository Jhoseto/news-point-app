import { withStaffAudit } from "../../../../lib/audit";
import { auditFacts } from "../../../../lib/audit-context";
import { refreshPodcastPages } from "../../../../lib/podcast-refresh";
import { randomBytes, randomUUID } from "node:crypto";
import { PODCAST_AUDIO_MAX_BYTES, podcastSlug } from "@newspoint/content";
import { preparePodcastAudio } from "@newspoint/content/audio";
import { insertPodcast, podcastAudioFormatsReady, podcastForStaff, podcastsReady, updatePodcastFiles } from "@newspoint/db/podcasts";
import { staffFromRequest } from "@/lib/session";
import { studioOrigins } from "@/lib/auth";
import { removeMediaFile, writeMediaFile } from "@/lib/media-disk";
import { prepareUploadedPhoto, UPLOADED_PHOTO_MAX_BYTES } from "@/lib/uploaded-photo";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "cache-control": "private, no-store" } });
}
function storageKey(extension: "webp" | "mp3" | "m4a") {
  const now = new Date();
  return `podcasts/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${randomUUID()}.${extension}`;
}

async function handlePOST(request: Request) {
  if (!studioOrigins().trusted.includes(request.headers.get("origin") ?? "")) return json({ error: { message: "Заявката трябва да идва от Studio." } }, 403);
  const staff = await staffFromRequest(request);
  if (!staff) return json({ error: { message: "Влезте отново." } }, 401);
  if (!["editor", "admin", "master_admin"].includes(staff.role)) return json({ error: { message: "Нямате права." } }, 403);
  if (!await podcastsReady()) return json({ error: { message: "Първо приложете миграция 22_podcasts.sql." } }, 503);
  const form = await request.formData();
  const title = String(form.get("title") ?? "").trim();
  const summary = String(form.get("summary") ?? "").trim();
  const categoryId = String(form.get("categoryId") ?? "").trim() || null;
  const id = String(form.get("id") ?? "").trim() || null;
  const cover = form.get("cover");
  const audio = form.get("audio");
  if (title.length < 2 || title.length > 180) return json({ error: { message: "Заглавието е от 2 до 180 знака." } }, 400);
  if (summary.length < 1 || summary.length > 600) return json({ error: { message: "Резюмето е до 600 знака." } }, 400);
  if ((id && !z.uuid().safeParse(id).success) || (categoryId && !z.uuid().safeParse(categoryId).success)) return json({ error: { message: "Невалиден епизод или рубрика." } }, 400);
  const existing = id ? await podcastForStaff(id) : null;
  if (id && !existing) return json({ error: { message: "Епизодът не е намерен." } }, 404);
  if ((!existing && (!(cover instanceof File) || !(audio instanceof File))) || (cover != null && !(cover instanceof File)) || (audio != null && !(audio instanceof File))) return json({ error: { message: "Качете корица и звуков файл." } }, 400);
  if (cover instanceof File && (!cover.type.startsWith("image/") || cover.size > UPLOADED_PHOTO_MAX_BYTES)) return json({ error: { message: "Качете снимка до 25 MB." } }, 400);
  if (audio instanceof File && audio.size > PODCAST_AUDIO_MAX_BYTES) return json({ error: { message: "Звуковият файл трябва да е до 80 MB." } }, 413);

  const createdKeys: string[] = [];
  let committed = false;
  try {
    const prepared = audio instanceof File ? await preparePodcastAudio(Buffer.from(await audio.arrayBuffer()), audio.name) : null;
    if (prepared?.extension === "m4a" && !await podcastAudioFormatsReady()) return json({ error: { message: "Първо приложете миграция 35_podcast_audio_formats.sql." } }, 503);
    const photo = cover instanceof File ? await prepareUploadedPhoto(Buffer.from(await cover.arrayBuffer())) : null;
    let coverKey = existing?.coverKey;
    let audioKey = existing?.audioKey;
    if (photo) {
      coverKey = storageKey("webp"); createdKeys.push(coverKey);
      await writeMediaFile(coverKey, photo.buffer);
    }
    if (prepared) {
      audioKey = storageKey(prepared.extension); createdKeys.push(audioKey);
      await writeMediaFile(audioKey, prepared.buffer);
    }
    const row = existing ? await updatePodcastFiles(existing.id, {
      title, summary, categoryId,
      ...(photo ? { coverKey: coverKey! } : {}),
      ...(prepared ? { audioKey: audioKey!, durationSec: prepared.durationSec, bytes: prepared.buffer.length } : {}),
    }) : await insertPodcast({
      title, summary, categoryId, coverKey: coverKey!, audioKey: audioKey!,
      slug: podcastSlug(title, randomBytes(3).toString("hex")),
      durationSec: prepared!.durationSec, bytes: prepared!.buffer.length,
      status: form.get("publish") === "1" ? "published" : "draft", createdBy: staff.id,
    });
    if (!row) throw new Error("Епизодът вече не е наличен.");
    committed = true;
    auditFacts({ entityId: row.id, entityLabel: title, previousAudioKey: existing?.audioKey ?? null, previousCoverKey: existing?.coverKey ?? null, coverFile: cover instanceof File ? cover.name.slice(0,240) : null, audioFile: audio instanceof File ? audio.name.slice(0,240) : null, inputAudioBytes: prepared?.originalBytes ?? null, storedAudioBytes: row.bytes, durationSec: row.durationSec, audioOptimized: prepared?.optimized ?? null });
    const refreshed = await refreshPodcastPages(row.slug).catch(() => false);
    return json({ id: row.id, slug: row.slug, refreshed, episode: {
      id: row.id, slug: row.slug, title: row.title, summary: row.summary, coverKey: row.coverKey, audioKey: row.audioKey,
      durationSec: row.durationSec, bytes: row.bytes, categoryId: row.categoryId, status: row.status,
      publishedAt: row.publishedAt?.toISOString() ?? null,
    }, ...(prepared ? { audioOptimization: { originalBytes: prepared.originalBytes, storedBytes: prepared.buffer.length, savedBytes: prepared.originalBytes-prepared.buffer.length } } : {}) });
  } catch (error) {
    if (!committed) for (const key of createdKeys) await removeMediaFile(key).catch(() => undefined);
    const message = error instanceof Error && /^(Качете|Невалид|Неподдържан|Оптимизиран|Епизодът)|снимка|корица/i.test(error.message) ? error.message : "Качването не мина. Проверете звуковия файл и сървърното място.";
    return json({ error: { message } }, message.startsWith("Качването не") ? 503 : 400);
  }
}
export const POST = withStaffAudit(handlePOST);
