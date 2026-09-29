import "server-only";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { readRemoteFile, remoteDiskFromEnv, removeRemoteFile, writeRemoteFile } from "@newspoint/content/disk";

const PREFIXES = ["users/profiles/", "users/livepoint/", "news/"] as const;

export function mediaRoot(): string | null {
  const root = process.env.MEDIA_ROOT?.trim();
  return root || null;
}

export function mediaFile(storageKey: string): string | null {
  const root = mediaRoot();
  if (!root) return null;
  if (!storageKey.startsWith("users/profiles/") && !storageKey.startsWith("users/livepoint/") && !storageKey.startsWith("news/")) return null;
  const parts = storageKey.split("/");
  if (parts.some((part) => !part || part === "." || part === "..")) return null;
  const full = resolve(root, ...parts);
  if (!full.startsWith(resolve(root))) return null;
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

export async function readMediaFile(storageKey: string): Promise<Buffer | null> {
  const remote = remoteDiskFromEnv();
  if (remote) return readRemoteFile(remote, storageKey, PREFIXES);
  const path = mediaFile(storageKey);
  if (!path) return null;
  try {
    return await readFile(path);
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
