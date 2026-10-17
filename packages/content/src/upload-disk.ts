
import { chmod, copyFile, mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { readRemoteFile, remoteDiskFromEnv, removeRemoteFile, writeRemoteFile } from "./remote-disk";

const PREFIXES = ["users/profiles/", "users/livepoint/", "news/", "podcasts/", "ai-podcasts/"] as const;

export function mediaRoot(): string | null {
  const root = process.env.MEDIA_ROOT?.trim();
  return root || null;
}

export function mediaFile(storageKey: string): string | null {
  const root = mediaRoot();
  if (!root) return null;
  if (!PREFIXES.some((prefix) => storageKey.startsWith(prefix))) return null;
  if (/[\\\u0000-\u001f\u007f]/.test(storageKey)) return null;
  const parts = storageKey.split("/");
  if (parts.some((part) => !part || part === "." || part === "..")) return null;
  const full = resolve(/* turbopackIgnore: true */ root, ...parts);
  const rootResolved = resolve(/* turbopackIgnore: true */ root);
  if (full !== rootResolved && !full.startsWith(rootResolved + sep)) return null;
  return full;
}

export async function writeMediaFile(storageKey: string, bytes: Buffer, stagingRoot?: string): Promise<void> {
  const remote = remoteDiskFromEnv();
  if (remote) {
    await writeRemoteFile(remote, storageKey, bytes, PREFIXES);
    return;
  }
  const path = mediaFile(storageKey);
  if (!path) throw new Error("storage unavailable");
  await mkdir(dirname(path), { recursive: true });
  await atomicMediaWrite(path, source => writeFile(source, bytes, { mode: 0o600 }), stagingRoot);
}

/** Production copies the optimized file directly; laptop SSH needs a bounded buffer. */
export async function writeMediaFromFile(storageKey: string, sourcePath: string, stagingRoot?: string): Promise<void> {
  const remote = remoteDiskFromEnv();
  if (remote) {
    await writeRemoteFile(remote, storageKey, await readFile(sourcePath), PREFIXES);
    return;
  }
  const path = mediaFile(storageKey);
  if (!path) throw new Error("storage unavailable");
  await mkdir(dirname(path), { recursive: true });
  await atomicMediaWrite(path, source => copyFile(sourcePath, source), stagingRoot);
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



/** Private sibling staging followed by same-filesystem atomic rename: no partial public object. */
async function atomicMediaWrite(destination: string, produce: (privatePath: string) => Promise<void>, stagingRoot?: string) {
 const root = mediaRoot(); if (!root) throw new Error("storage unavailable");
 const directory = await mkdtemp(resolve(/* turbopackIgnore: true */ stagingRoot || dirname(root), ".newspoint-media-stage-"));
 try { const temporary = resolve(/* turbopackIgnore: true */ directory, "asset"); await produce(temporary); await chmod(temporary, 0o644); await rename(temporary, destination); }
 finally { await rm(directory, { recursive: true, force: true }); }
}
