import "server-only";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { readRemoteFile, remoteDiskFromEnv, remoteObjectPath, removeRemoteFile, writeRemoteFile } from "@newspoint/content/disk";

const PREFIXES = ["news/", "users/", "podcasts/"] as const;

export function mediaRoot(): string | null {
  const root = process.env.MEDIA_ROOT?.trim();
  return root || null;
}

export function mediaFile(storageKey: string): string | null {
  const root = mediaRoot();
  if (!root) return null;
  if (!storageKey.startsWith("news/") && !storageKey.startsWith("users/") && !storageKey.startsWith("podcasts/")) return null;
  const parts = storageKey.split("/");
  if (parts.some((part) => !part || part === "." || part === "..")) return null;
  const full = resolve(root, ...parts);
  const rootResolved = resolve(root);
  if (full !== rootResolved && !full.startsWith(rootResolved + "/")) return null;
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
  const origin = (process.env.MEDIA_ORIGIN ?? "").trim().replace(/\/+$/, "");
  if (origin && remoteObjectPath("/safe", storageKey, ["news/"])) {
    const encoded = storageKey.split("/").map((part) => encodeURIComponent(part)).join("/");
    try {
      const response = await fetch(`${origin}/media/${encoded}`, { cache: "no-store", signal: AbortSignal.timeout(15_000) });
      if (response.ok) return Buffer.from(await response.arrayBuffer());
    } catch {
      /* the ssh or local copy below still applies */
    }
  }
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
