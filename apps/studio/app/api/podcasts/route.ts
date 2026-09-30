import { z } from "zod";
import { podcastsReady, setPodcastStatus, updatePodcastCopy, PodcastError } from "@newspoint/db/podcasts";
import { staffFromRequest } from "@/lib/session";
import { studioOrigins } from "@/lib/auth";

export const dynamic = "force-dynamic";

const body = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("save"),
    id: z.uuid(),
    title: z.string().trim().min(2).max(180),
    summary: z.string().trim().min(1).max(600),
    categoryId: z.uuid().nullable(),
  }).strict(),
  z.object({ action: z.literal("publish"), id: z.uuid() }).strict(),
  z.object({ action: z.literal("hide"), id: z.uuid() }).strict(),
]);

function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "cache-control": "private, no-store" } });
}

async function refresh(slug: string | null) {
  if (!process.env.REVALIDATE_SECRET) return false;
  const paths = ["/", "/livepoint/podcast/"];
  if (slug) paths.push(`/livepoint/podcast/${slug}/`);
  try {
    const response = await fetch(new URL("/api/revalidate/", process.env.WEB_URL || "http://localhost:3000"), {
      method: "POST",
      headers: { "content-type": "application/json", "x-revalidate-secret": process.env.REVALIDATE_SECRET },
      body: JSON.stringify({ paths }),
      signal: AbortSignal.timeout(3000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  if (!studioOrigins().trusted.includes(request.headers.get("origin") ?? "")) return json({ error: { message: "Заявката трябва да идва от Studio." } }, 403);
  const staff = await staffFromRequest(request);
  if (!staff) return json({ error: { message: "Влезте отново." } }, 401);
  if (!await podcastsReady()) return json({ error: { message: "Първо приложете миграция 22_podcasts.sql." } }, 503);
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ error: { message: "Невалидни данни." } }, 400);
  try {
    if (parsed.data.action === "save") {
      const row = await updatePodcastCopy(parsed.data.id, parsed.data);
      if (!row) return json({ error: { message: "Епизодът не е намерен." } }, 404);
      const refreshed = row.status === "published" ? await refresh(row.slug) : false;
      return json({ ok: true, refreshed });
    }
    const status = parsed.data.action === "publish" ? "published" : "draft";
    const row = await setPodcastStatus(parsed.data.id, status);
    if (!row) return json({ error: { message: "Епизодът не е намерен." } }, 404);
    const refreshed = status === "published" || row.status === "draft" ? await refresh(row.slug) : false;
    return json({ ok: true, refreshed });
  } catch (error) {
    if (error instanceof PodcastError) return json({ error: { message: error.message } }, error.status);
    console.error("[studio-podcasts]", error instanceof Error ? error.message : "unknown");
    return json({ error: { message: "Записът не мина." } }, 503);
  }
}
