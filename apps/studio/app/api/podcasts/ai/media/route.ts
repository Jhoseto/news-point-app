import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { eq } from "drizzle-orm";
import { planPodcastAudio } from "@newspoint/content";
import { openRemoteRange, remoteDiskFromEnv, remoteFileSize } from "@newspoint/content/disk";
import { aiPodcastAssets, aiPodcastProjects, getDb, podcasts } from "@newspoint/db";
import { mediaFile, readMediaFile } from "@/lib/media-disk";
import { staffFromRequest } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const staff = await staffFromRequest(request);
  if (!staff) return new Response("Unauthorized", { status: 401 });
  if (!["editor", "admin", "master_admin"].includes(staff.role)) return new Response("Forbidden", { status: 403 });
  const url = new URL(request.url);
  const key = url.searchParams.get("key") ?? "";
  if (!/^(ai-podcasts|podcasts)\/[a-z0-9/-]+\.(mp3|webp)$/.test(key)) return new Response("Not found", { status: 404 });
  const [asset] = await getDb().select({ id: aiPodcastAssets.id }).from(aiPodcastAssets).where(eq(aiPodcastAssets.storageKey, key)).limit(1);
  const [cover] = await getDb().select({ id: aiPodcastProjects.id }).from(aiPodcastProjects).where(eq(aiPodcastProjects.coverKey, key)).limit(1);
  const [episode] = await getDb().select({ id: podcasts.id }).from(podcasts).where(eq(podcasts.audioKey, key)).limit(1);
  if (!asset && !cover && !episode) return new Response("Not found", { status: 404 });
  if (key.endsWith(".webp")) {
    const bytes = await readMediaFile(key);
    return bytes ? new Response(new Uint8Array(bytes), { headers: { "content-type": "image/webp", "cache-control": "private, no-store" } }) : new Response("Not found", { status: 404 });
  }
  const remote = remoteDiskFromEnv();
  const local = mediaFile(key);
  const localStat = local ? await stat(local).catch(() => null) : null;
  const size = localStat?.isFile() ? localStat.size : remote ? await remoteFileSize(remote, key, ["podcasts/", "ai-podcasts/"]) : null;
  if (size == null) return new Response("Not found", { status: 404 });
  const plan = planPodcastAudio(size, request.headers.get("range"), null);
  if (plan.status === 416) return new Response(null, { status: 416, headers: plan.headers });
  if (plan.status === 404) return new Response("Not found", { status: 404 });
  const stream = localStat?.isFile() && local ? createReadStream(local, { start: plan.start, end: plan.end }) : openRemoteRange(remote!, key, ["podcasts/", "ai-podcasts/"], plan.start, plan.end - plan.start + 1);
  return new Response(Readable.toWeb(stream) as ReadableStream, { status: plan.status, headers: { ...plan.headers, "cache-control": "private, no-store" } });
}
