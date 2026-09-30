import "server-only";
import { createWriteStream } from "node:fs";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { openRemoteRange, remoteDiskFromEnv } from "@newspoint/content/disk";

// Only the SSH development path needs this cache. Production reads MEDIA_ROOT.
// At most two files, each limited to the existing 90 MB audio storage limit.
const entries = new Map<string, { path: string | null; directory: string | null; expires: number }>();
const ttl = 15 * 60_000;

export function cachedPodcastAudio(key: string): string | null {
  const entry = entries.get(key);
  return entry && entry.expires > Date.now() ? entry.path : null;
}

export function warmPodcastAudio(key: string, size: number, disk: NonNullable<ReturnType<typeof remoteDiskFromEnv>>) {
  if (size <= 0 || size > 90_000_000) return;
  const identity = `${disk.target}:${disk.root}:${key}`;
  for (const [id, entry] of entries) {
    if (entry.expires > Date.now()) continue;
    entries.delete(id);
    if (entry.directory) void rm(entry.directory, { recursive: true, force: true }).catch(() => undefined);
  }
  if (entries.has(identity) || entries.size >= 2) return;
  const entry = { path: null as string | null, directory: null as string | null, expires: Date.now() + ttl };
  entries.set(identity, entry);
  const cleanup = setTimeout(() => {
    if (entries.get(identity) !== entry) return;
    entries.delete(identity);
    if (entry.directory) void rm(entry.directory, { recursive: true, force: true }).catch(() => undefined);
  }, ttl);
  cleanup.unref();
  void (async () => {
    const directory = await mkdtemp(join(tmpdir(), "newspoint-podcast-"));
    entry.directory = directory;
    const path = join(directory, "audio.mp3");
    await pipeline(openRemoteRange(disk, key, ["podcasts/"], 0, size), createWriteStream(path));
    if ((await stat(path)).size !== size) throw new Error("Incomplete audio cache");
    entry.path = path;
  })().catch(async () => {
    entries.delete(identity);
    if (entry.directory) await rm(entry.directory, { recursive: true, force: true }).catch(() => undefined);
  });
}

export function podcastCacheKey(key: string, disk: NonNullable<ReturnType<typeof remoteDiskFromEnv>>) {
  return `${disk.target}:${disk.root}:${key}`;
}
