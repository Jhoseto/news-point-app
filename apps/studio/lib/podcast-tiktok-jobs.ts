import "server-only";
import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { lstat, mkdir, open, readdir, realpath, rm, stat, statfs } from "node:fs/promises";
import { tmpdir, userInfo } from "node:os";
import { join, relative, sep } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { isPodcastSocialCover, parseByteRange, podcastAudioExtension, PODCAST_AUDIO_MAX_BYTES } from "@newspoint/content";
import { openRemoteRange, remoteDiskFromEnv, remoteFileSize } from "@newspoint/content/disk";
import { UPLOADED_PHOTO_MAX_BYTES } from "@newspoint/content/upload-photo-limit";
import { uploadTempRoot } from "@newspoint/db/media-uploads";
import type { podcastForStaff } from "@newspoint/db/podcasts";
import { mediaFile, mediaRoot } from "./media-disk";
import { renderPodcastTikTok } from "./podcast-tiktok-render";

export type PodcastTikTokStatus = {
  jobId: string;
  state: "preparing" | "rendering" | "ready" | "failed";
  percent: number;
  message?: string;
};
type Episode = Pick<NonNullable<Awaited<ReturnType<typeof podcastForStaff>>>, "id" | "slug" | "revision" | "audioKey" | "coverKey" | "durationSec">;
type Job = {
  owner: string;
  episode: Episode;
  status: PodcastTikTokStatus;
  directory?: string;
};

export class PodcastTikTokError extends Error {
  constructor(readonly status: 404 | 409 | 422 | 503, readonly code: string, message: string) { super(message); }
}

// Production runs one persistent Studio Node process. Retain the registry across route reloads.
const registry = globalThis as typeof globalThis & { __npTikTokJobs?: Map<string, Job> };
const jobs = registry.__npTikTokJobs ??= new Map<string, Job>();
const hour = 3_600_000;
const maxRenderTime = 24 * hour;
const retention = hour;
const missing = () => new PodcastTikTokError(404, "export_expired", "Файлът вече не е наличен. Създайте TikTok версията отново.");
const sourceError = () => new PodcastTikTokError(422, "export_media", "Звукът или обложката на епизода не е достъпен. Проверете файловете и опитайте отново.");
const active = (job: Job) => job.status.state === "preparing" || job.status.state === "rendering";

async function privateRoot() {
  const root = remoteDiskFromEnv()
    ? join(tmpdir(), `newspoint-studio-tiktok-${userInfo().uid}`)
    : join(uploadTempRoot(), "podcast-tiktok");
  await mkdir(root, { recursive: true, mode: 0o700 });
  const directory = await lstat(root);
  if (!directory.isDirectory() || process.getuid && (directory.uid !== process.getuid() || (directory.mode & 0o077) !== 0)) {
    throw new Error("private export directory unavailable");
  }
  // A forced restart can leave an abandoned file. Only collect our own old UUID directories.
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || jobs.has(entry.name) || !/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/.test(entry.name)) continue;
    const path = join(root, entry.name);
    const info = await lstat(path).catch(() => null);
    if (info?.isDirectory() && info.mtimeMs < Date.now() - maxRenderTime - retention) await rm(path, { recursive: true, force: true });
  }
  return root;
}

async function mediaSource(key: string, limit: number, destination: string, signal: AbortSignal) {
  const remote = remoteDiskFromEnv();
  if (remote) {
    const prefixes = ["podcasts/"];
    const size = await remoteFileSize(remote, key, prefixes);
    if (!size || size > limit) throw sourceError();
    // The shared SSH reader bounds each slice. Stream even a full-size episode without buffering it.
    const chunkSize = 8 * 1024 * 1024;
    for (let offset = 0; offset < size; offset += chunkSize) {
      const length = Math.min(chunkSize, size - offset);
      await pipeline(openRemoteRange(remote, key, prefixes, offset, length), createWriteStream(destination, { flags: offset ? "a" : "wx", mode: 0o600 }), { signal });
      if ((await stat(destination)).size !== offset + length) throw sourceError();
    }
    return destination;
  }
  const localPath = mediaFile(key);
  const base = mediaRoot();
  if (!localPath || !base) throw sourceError();
  const [root, path] = await Promise.all([realpath(base), realpath(localPath)]).catch(() => { throw sourceError(); });
  const rel = relative(root, path);
  if (!rel.startsWith(`podcasts${sep}`)) throw sourceError();
  const info = await stat(path);
  if (!info.isFile() || !info.size || info.size > limit) throw sourceError();
  return path;
}

async function removeFiles(job: Job) {
  if (job.directory) await rm(job.directory, { recursive: true, force: true, maxRetries: 2 }).catch(() => undefined);
}

function forget(job: Job) {
  jobs.delete(job.status.jobId);
  void removeFiles(job);
}

async function produce(job: Job) {
  const { episode, status } = job;
  const controller = new AbortController();
  const abort = () => controller.abort();
  // Stop child encoders when Studio shuts down or restarts during an export.
  process.once("SIGTERM", abort);
  process.once("SIGINT", abort);
  process.once("exit", abort);
  const timeout = setTimeout(abort, Math.min(maxRenderTime, Math.max(hour / 2, episode.durationSec * 8000))).unref();
  try {
    const root = await privateRoot();
    const space = await statfs(root);
    // Reserve for the encoded video, source staging and fast-start muxing.
    if (space.bavail * space.bsize < episode.durationSec * 450_000 + 512 * 1024 ** 2) {
      throw new PodcastTikTokError(503, "export_space", "Няма достатъчно свободно място за видеото. Опитайте по-късно.");
    }
    const directory = join(root, status.jobId);
    await mkdir(directory, { mode: 0o700 });
    job.directory = directory;
    const audioPath = await mediaSource(episode.audioKey, PODCAST_AUDIO_MAX_BYTES, join(directory, `audio.${podcastAudioExtension(episode.audioKey)}`), controller.signal);
    const coverPath = await mediaSource(episode.coverKey, UPLOADED_PHOTO_MAX_BYTES, join(directory, "cover.webp"), controller.signal);
    status.state = "rendering";
    await renderPodcastTikTok({ coverPath, audioPath, signal: controller.signal, outputPath: join(directory, "video.mp4"), onProgress(percent) {
      status.percent = Math.max(status.percent, Math.min(99, Math.floor(percent)));
    } });
    status.state = "ready";
    status.percent = 100;
  } catch (error) {
    await removeFiles(job);
    status.state = "failed";
    status.message = error instanceof PodcastTikTokError ? error.message : "Видеото не беше създадено. Проверете звука и обложката и опитайте отново.";
    if (!(error instanceof PodcastTikTokError)) console.error("[podcast-tiktok]", status.jobId, error instanceof Error ? error.message : "render failed");
  } finally {
    process.off("SIGTERM", abort);
    process.off("SIGINT", abort);
    process.off("exit", abort);
    clearTimeout(timeout);
    setTimeout(() => forget(job), retention).unref();
  }
}

export function startPodcastTikTok(owner: string, episode: Episode): PodcastTikTokStatus {
  if (!isPodcastSocialCover(episode.coverKey) || !podcastAudioExtension(episode.audioKey)) throw sourceError();
  // Reserve synchronously before the first I/O. Concurrent clicks for this revision join the same job.
  for (const job of jobs.values()) {
    if (job.owner === owner && job.episode.id === episode.id && job.episode.revision === episode.revision && job.status.state !== "failed") return { ...job.status };
  }
  if ([...jobs.values()].some(active)) throw new PodcastTikTokError(409, "export_busy", "В момента се подготвя друго видео. Опитайте след приключването му.");
  // Jobs are in insertion order and all retained jobs are terminal at this point.
  if (jobs.size >= 8) forget(jobs.values().next().value!);
  const status: PodcastTikTokStatus = { jobId: randomUUID(), state: "preparing", percent: 0 };
  const job = { owner, episode, status };
  jobs.set(status.jobId, job);
  void produce(job);
  return { ...status };
}

function ownedJob(owner: string, episodeId: string, jobId: string) {
  const job = jobs.get(jobId);
  if (!job || job.owner !== owner || job.episode.id !== episodeId) throw missing();
  return job;
}

export function readPodcastTikTok(owner: string, episodeId: string, jobId: string) {
  return { ...ownedJob(owner, episodeId, jobId).status };
}

export async function downloadPodcastTikTok(owner: string, episodeId: string, jobId: string, rangeHeader: string | null) {
  const job = ownedJob(owner, episodeId, jobId);
  if (job.status.state !== "ready" || !job.directory) throw new PodcastTikTokError(409, "export_incomplete", "Видеото все още не е готово за изтегляне.");
  const file = await open(join(job.directory, "video.mp4"), "r").catch(() => { forget(job); throw missing(); });
  try {
    const { size } = await file.stat();
    const range = parseByteRange(rangeHeader, size);
    const headers = { "cache-control": "private, no-store", "accept-ranges": "bytes", "x-content-type-options": "nosniff" };
    if (range === "invalid") {
      await file.close();
      return new Response(null, { status: 416, headers: { ...headers, "content-range": `bytes */${size}` } });
    }
    const slug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(job.episode.slug) ? job.episode.slug : "podcast";
    const stream = file.createReadStream(range ?? {});
    const body = Readable.toWeb(stream, { strategy: { highWaterMark: 256 * 1024, size: (chunk: Uint8Array) => chunk.byteLength } });
    return new Response(body as ReadableStream<Uint8Array>, { status: range ? 206 : 200, headers: {
      ...headers, "content-type": "video/mp4", "content-disposition": `attachment; filename="${slug}-tiktok.mp4"`,
      "content-length": String(range ? range.end - range.start + 1 : size),
      ...(range ? { "content-range": `bytes ${range.start}-${range.end}/${size}` } : {}),
    } });
  } catch (error) {
    await file.close();
    throw error;
  }
}
