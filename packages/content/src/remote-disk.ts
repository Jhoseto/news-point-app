import { spawn } from "node:child_process";
import type { Readable } from "node:stream";

export type RemoteDisk = {
  target: string;
  port: string;
  key: string;
  root: string;
};

export function remoteDiskFromEnv(env: NodeJS.ProcessEnv = process.env): RemoteDisk | null {
  const target = env.MEDIA_SSH_TARGET?.trim() ?? "";
  const key = env.MEDIA_SSH_KEY?.trim() ?? "";
  const root = (env.MEDIA_ROOT ?? "").trim().replace(/\\/g, "/").replace(/\/+$/, "");
  const port = env.MEDIA_SSH_PORT?.trim() || "6543";
  if (!target || !key || !root.startsWith("/")) return null;
  if (!/^\d+$/.test(port)) return null;
  if (/[\s'"]/.test(target) || /[\r\n]/.test(key) || root.includes("..") || root.includes("'")) return null;
  return { target, port, key, root };
}

/** POSIX path on the server. Rejects traversal and quotes so the remote shell cannot be rewritten. */
export function remoteObjectPath(root: string, storageKey: string, prefixes: readonly string[]): string | null {
  const base = root.replace(/\\/g, "/").replace(/\/+$/, "");
  if (!base.startsWith("/") || base.includes("..") || base.includes("'")) return null;
  if (!prefixes.some((prefix) => storageKey.startsWith(prefix))) return null;
  if (/['\r\n\\]/.test(storageKey)) return null;
  const parts = storageKey.split("/");
  if (parts.some((part) => !part || part === "." || part === "..")) return null;
  return `${base}/${parts.join("/")}`;
}

function runSsh(disk: RemoteDisk, command: string, stdin?: Buffer): Promise<{ code: number; stdout: Buffer }> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "ssh",
      ["-i", disk.key, "-p", disk.port, "-o", "IdentitiesOnly=yes", "-o", "BatchMode=yes", "-o", "ConnectTimeout=10", disk.target, command],
      { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] },
    );
    const out: Buffer[] = [];
    let size = 0;
    let failed = false;
    const timer = setTimeout(() => {
      failed = true;
      child.kill();
    }, 20_000);
    child.stdout.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > 16_000_000) {
        failed = true;
        child.kill();
        return;
      }
      out.push(chunk);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (failed) {
        reject(new Error("storage unavailable"));
        return;
      }
      resolve({ code: code ?? 1, stdout: Buffer.concat(out) });
    });
    if (stdin) child.stdin.end(stdin);
    else child.stdin.end();
  });
}

export async function writeRemoteFile(disk: RemoteDisk, storageKey: string, bytes: Buffer, prefixes: readonly string[]): Promise<void> {
  const path = remoteObjectPath(disk.root, storageKey, prefixes);
  if (!path) throw new Error("storage unavailable");
  const dir = path.slice(0, path.lastIndexOf("/"));
  const result = await runSsh(disk, `mkdir -p '${dir}' && cat > '${path}'`, bytes);
  if (result.code !== 0) throw new Error("storage unavailable");
}

export async function readRemoteFile(disk: RemoteDisk, storageKey: string, prefixes: readonly string[]): Promise<Buffer | null> {
  const file = remoteObjectPath(disk.root, storageKey, prefixes);
  if (!file) return null;
  try {
    const result = await runSsh(disk, `cat '${file}'`);
    if (result.code !== 0 || !result.stdout.length) return null;
    return result.stdout;
  } catch {
    return null;
  }
}

export async function remoteFileSize(disk: RemoteDisk, storageKey: string, prefixes: readonly string[]): Promise<number | null> {
  const file = remoteObjectPath(disk.root, storageKey, prefixes);
  if (!file) return null;
  try {
    const result = await runSsh(disk, `stat -c %s '${file}'`);
    if (result.code !== 0) return null;
    const size = Number(result.stdout.toString("utf8").trim());
    return Number.isInteger(size) && size >= 0 ? size : null;
  } catch {
    return null;
  }
}

/** Byte slice of a remote file. The caller must destroy the stream. */
export function openRemoteRange(disk: RemoteDisk, storageKey: string, prefixes: readonly string[], start: number, length: number): Readable {
  const file = remoteObjectPath(disk.root, storageKey, prefixes);
  if (!file || !Number.isInteger(start) || !Number.isInteger(length) || start < 0 || length <= 0 || length > 90_000_000) {
    throw new Error("storage unavailable");
  }
  const child = spawn(
    "ssh",
    ["-i", disk.key, "-p", disk.port, "-o", "IdentitiesOnly=yes", "-o", "BatchMode=yes", "-o", "ConnectTimeout=10", disk.target,
      `dd if='${file}' iflag=skip_bytes,count_bytes skip=${start} count=${length} status=none`],
    { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
  );
  if (!child.stdout) throw new Error("storage unavailable");
  const timer = setTimeout(() => child.kill(), 60_000);
  child.on("close", () => clearTimeout(timer));
  child.on("error", () => clearTimeout(timer));
  return child.stdout;
}

export async function removeRemoteFile(disk: RemoteDisk, storageKey: string, prefixes: readonly string[]): Promise<void> {
  const file = remoteObjectPath(disk.root, storageKey, prefixes);
  if (!file) return;
  const result = await runSsh(disk, `rm -f '${file}'`);
  if (result.code !== 0) throw new Error("storage unavailable");
}
