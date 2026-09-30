import "server-only";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { planPodcastAudio } from "@newspoint/content";
import { openRemoteRange, remoteDiskFromEnv, remoteFileSize } from "@newspoint/content/disk";
import { mediaFile } from "./media-disk";
import { cachedPodcastAudio, podcastCacheKey, warmPodcastAudio } from "./podcast-audio-cache";

const PREFIXES = ["podcasts/"] as const;

export async function podcastAudioResponse(storageKey: string, rangeHeader: string | null, downloadName: string | null): Promise<Response> {
  if (!storageKey.startsWith("podcasts/") || !storageKey.endsWith(".mp3")) return new Response("Not found", { status: 404 });
  const remote = remoteDiskFromEnv();
  const local = (remote && cachedPodcastAudio(podcastCacheKey(storageKey, remote))) || mediaFile(storageKey);
  const localStat = local ? await stat(local).catch(() => null) : null;
  const size = localStat?.isFile() ? localStat.size : remote ? await remoteFileSize(remote, storageKey, PREFIXES) : null;
  if (size == null) return new Response("Not found", { status: 404 });
  const plan = planPodcastAudio(size, rangeHeader, downloadName);
  if (plan.status === 404) return new Response("Not found", { status: 404 });
  if (plan.status === 416) return new Response(null, { status: 416, headers: plan.headers });
  if (!localStat?.isFile() && remote) warmPodcastAudio(storageKey, size, remote);
  const length = plan.end - plan.start + 1;
  const nodeStream = localStat?.isFile() && local
    ? createReadStream(local, { start: plan.start, end: plan.end })
    : openRemoteRange(remote!, storageKey, PREFIXES, plan.start, length);
  return new Response(Readable.toWeb(nodeStream) as ReadableStream, { status: plan.status, headers: plan.headers });
}
