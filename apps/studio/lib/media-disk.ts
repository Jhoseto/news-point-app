import "server-only";
import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { readRemoteFile, remoteDiskFromEnv, removeRemoteFile, writeRemoteFile } from "@newspoint/content/disk";

const PREFIXES = ["users/profiles/", "users/livepoint/", "news/", "podcasts/", "ai-podcasts/"] as const;

export function mediaRoot(): string | null {
  const root = process.env.MEDIA_ROOT?.trim();
  return root || null;
}

export function mediaFile(storageKey: string): string | null {
  const root = mediaRoot();
  if (!root) return null;
  if (!PREFIXES.some((prefix) => storageKey.startsWith(prefix))) return null;
  const parts = storageKey.split("/");
  if (parts.some((part) => !part || part === "." || part === "..")) return null;
  const full = resolve(/* turbopackIgnore: true */ root, ...parts);
  const rootResolved = resolve(/* turbopackIgnore: true */ root);
  if (full !== rootResolved && !full.startsWith(rootResolved + sep)) return null;
  return full;
}

export async function writeMediaFile(storageKey: string, bytes: Buffer): Promise<void> {
  const remote = remoteDiskFromEnv();
  if (remote) {
    await writeRemoteFile(remote, storageKey, bytes, PREFIXES);
    return;
  }
  const path = mediaFile(storageKey);
  if (!path) throw new Error("storage unavailable");
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, bytes);
}

/** Production copies the optimized file directly; laptop SSH needs a bounded buffer. */
export async function writeMediaFromFile(storageKey: string, sourcePath: string): Promise<void> {
  const remote = remoteDiskFromEnv();
  if (remote) {
    await writeRemoteFile(remote, storageKey, await readFile(sourcePath), PREFIXES);
    return;
  }
  const path = mediaFile(storageKey);
  if (!path) throw new Error("storage unavailable");
  await mkdir(dirname(path), { recursive: true });
  await copyFile(sourcePath, path);
}

export async function readMediaFile(storageKey: string): Promise<Buffer | null> {
  const remote = remoteDiskFromEnv();
  if (remote) return readRemoteFile(remote, storageKey, PREFIXES);
  const path = mediaFile(storageKey);
  if (!path) return null;
  try {
    return await readFile(/* turbopackIgnore: true */ path);
  } catch {
    return null;
  }
}

export async function removeMediaFile(storageKey: string): Promise<void> {
  const remote = remoteDiskFromEnv();
  if (remote) {
    await removeRemoteFile(remote, storageKey, PREFIXES);
    return;
  }
  const path = mediaFile(storageKey);
  if (!path) return;
  await rm(path, { force: true });
}
