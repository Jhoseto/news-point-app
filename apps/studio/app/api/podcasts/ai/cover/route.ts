import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import sharp from "sharp";
import { aiPodcastAudit, aiPodcastJobs, aiPodcastProjects, getDb, podcasts } from "@newspoint/db";
import { studioOrigins } from "@/lib/auth";
import { writeMediaFile } from "@/lib/media-disk";
import { staffFromRequest } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(data: unknown, status = 200) { return Response.json(data, { status, headers: { "cache-control": "private, no-store" } }); }

export async function POST(request: Request) {
  if (!studioOrigins().trusted.includes(request.headers.get("origin") ?? "")) return json({ error: "Заявката трябва да идва от Studio." }, 403);
  const staff = await staffFromRequest(request);
  if (!staff) return json({ error: "Влезте отново." }, 401);
  const form = await request.formData();
  const id = String(form.get("projectId") ?? "");
  const file = form.get("cover");
  if (!/^[0-9a-f-]{36}$/i.test(id) || !(file instanceof File) || !file.type.startsWith("image/") || file.size > 25 * 1024 * 1024) return json({ error: "Изберете валидна снимка до 25 MB." }, 400);
  const [project] = await getDb().select().from(aiPodcastProjects).where(eq(aiPodcastProjects.id, id)).limit(1);
  if (!project || !["review", "ready"].includes(project.status)) return json({ error: "Проектът не е готов за обложка." }, 409);
  const [active] = await getDb().select({ id: aiPodcastJobs.id }).from(aiPodcastJobs).where(and(eq(aiPodcastJobs.projectId, id), inArray(aiPodcastJobs.status, ["queued", "running"]))).limit(1);
  if (active) return json({ error: "Изчакайте текущата задача." }, 409);
  if (project.episodeId) {
    const [episode] = await getDb().select({ status: podcasts.status }).from(podcasts).where(eq(podcasts.id, project.episodeId)).limit(1);
    if (episode?.status === "published") return json({ error: "Първо скрийте публикувания епизод." }, 409);
  }
  try {
    const bytes = await sharp(Buffer.from(await file.arrayBuffer()), { limitInputPixels: 40_000_000 }).rotate().resize(1200, 1200, { fit: "cover" }).webp({ quality: 86 }).toBuffer();
    const date = new Date();
    const key = `podcasts/${date.getUTCFullYear()}/${String(date.getUTCMonth() + 1).padStart(2, "0")}/${randomUUID()}.webp`;
    await writeMediaFile(key, bytes);
    await getDb().transaction(async (tx) => {
      await tx.update(aiPodcastProjects).set({ coverKey: key, updatedAt: new Date() }).where(eq(aiPodcastProjects.id, id));
      if (project.episodeId) await tx.update(podcasts).set({ coverKey: key, updatedAt: new Date() }).where(eq(podcasts.id, project.episodeId));
      await tx.insert(aiPodcastAudit).values({ projectId: id, actorId: staff.id, action: "cover_uploaded", details: { key } });
    });
    return json({ key });
  } catch (error) {
    console.error("[ai-cover]", error instanceof Error ? error.message : error);
    return json({ error: "Обложката не беше записана." }, 503);
  }
}
