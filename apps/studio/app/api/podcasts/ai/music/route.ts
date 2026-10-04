import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { aiPodcastSettings, inspectMp3 } from "@newspoint/content";
import { aiPodcastAssets, aiPodcastAudit, aiPodcastJobs, aiPodcastProjects, getDb, podcasts } from "@newspoint/db";
import { studioOrigins } from "@/lib/auth";
import { removeMediaFile, writeMediaFile } from "@/lib/media-disk";
import { staffFromRequest } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(data: unknown, status = 200) { return Response.json(data, { status, headers: { "cache-control": "private, no-store" } }); }

export async function POST(request: Request) {
  if (!studioOrigins().trusted.includes(request.headers.get("origin") ?? "")) return json({ error: "Заявката трябва да идва от Studio." }, 403);
  const staff = await staffFromRequest(request);
  if (!staff || !["editor", "admin", "master_admin"].includes(staff.role)) return json({ error: "Нямате достъп." }, 403);
  const form = await request.formData().catch(() => null);
  const projectId = String(form?.get("projectId") ?? "");
  const file = form?.get("music");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(projectId) || !(file instanceof File) || file.size < 1024 || file.size > 30 * 1024 * 1024 || !/\.mp3$/i.test(file.name)) return json({ error: "Изберете MP3 файл до 30 MB." }, 400);
  const bytes = Buffer.from(await file.arrayBuffer());
  const inspected = inspectMp3(bytes);
  if (!inspected || inspected.durationSec < 10) return json({ error: "MP3 файлът е невалиден или по-къс от 10 секунди." }, 400);
  const [project] = await getDb().select().from(aiPodcastProjects).where(eq(aiPodcastProjects.id, projectId)).limit(1);
  if (!project || !["review", "ready"].includes(project.status)) return json({ error: "Проектът не е готов за музика." }, 409);
  const [active] = await getDb().select({ id: aiPodcastJobs.id }).from(aiPodcastJobs).where(and(eq(aiPodcastJobs.projectId, projectId), inArray(aiPodcastJobs.status, ["queued", "running"]))).limit(1);
  if (active) return json({ error: "Изчакайте текущата задача." }, 409);
  if (project.episodeId) {
    const [episode] = await getDb().select({ status: podcasts.status }).from(podcasts).where(eq(podcasts.id, project.episodeId)).limit(1);
    if (episode?.status === "published") return json({ error: "Първо скрийте публикувания епизод." }, 409);
  }
  const now = new Date();
  const key = `ai-podcasts/assets/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${randomUUID()}.mp3`;
  try {
    await writeMediaFile(key, bytes);
    const settings = aiPodcastSettings.parse(project.settings);
    const asset = await getDb().transaction(async (tx) => {
      const [created] = await tx.insert(aiPodcastAssets).values({ kind: "music", preset: null, status: "candidate", storageKey: key, prompt: file.name.slice(0, 180), model: "uploaded", metadata: { projectId, durationSec: inspected.durationSec, bytes: bytes.length }, createdBy: staff.id }).returning({ id: aiPodcastAssets.id });
      await tx.update(aiPodcastProjects).set({ musicAssetId: created!.id, settings: { ...settings, music: "custom" }, updatedAt: new Date() }).where(eq(aiPodcastProjects.id, projectId));
      await tx.insert(aiPodcastAudit).values({ projectId, actorId: staff.id, action: "music_uploaded", details: { assetId: created!.id, durationSec: inspected.durationSec } });
      return created!;
    });
    return json({ assetId: asset.id, durationSec: inspected.durationSec }, 201);
  } catch (error) {
    await removeMediaFile(key).catch(() => {});
    console.error("[ai-music-upload]", error instanceof Error ? error.message : error);
    return json({ error: "Музиката не беше записана." }, 503);
  }
}
