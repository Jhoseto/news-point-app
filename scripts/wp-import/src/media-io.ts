import { remoteDiskFromEnv, readRemoteFile, writeRemoteFile, removeRemoteFile, remoteFileSize } from "@newspoint/content/disk";
import { fileExists, readStorageFile, removeStorageFile, writeStorageFile } from "./responsive-ladder";

const PREFIXES = ["news/"] as const;

/** Local MEDIA_ROOT on the server, or SSH remote when MEDIA_SSH_* is set (laptop). */
export async function ioRead(storageKey: string): Promise<Buffer | null> {
  const remote = remoteDiskFromEnv();
  if (remote) return readRemoteFile(remote, storageKey, PREFIXES);
  return readStorageFile(storageKey);
}

export async function ioWrite(storageKey: string, bytes: Buffer): Promise<void> {
  const remote = remoteDiskFromEnv();
  if (remote) {
    await writeRemoteFile(remote, storageKey, bytes, PREFIXES);
    return;
  }
  await writeStorageFile(storageKey, bytes);
}

export async function ioRemove(storageKey: string): Promise<boolean> {
  const remote = remoteDiskFromEnv();
  if (remote) {
    try {
      await removeRemoteFile(remote, storageKey, PREFIXES);
      return true;
    } catch {
      return false;
    }
  }
  return removeStorageFile(storageKey);
}

export async function ioExists(storageKey: string): Promise<boolean> {
  const remote = remoteDiskFromEnv();
  if (remote) {
    const size = await remoteFileSize(remote, storageKey, PREFIXES);
    return size !== null && size > 0;
  }
  return fileExists(storageKey);
}
