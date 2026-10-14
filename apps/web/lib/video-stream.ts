import "server-only";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { localVideoUrl, parseByteRange } from "@newspoint/content";
import { openRemoteRange, remoteDiskFromEnv, remoteFileSize } from "@newspoint/content/disk";
import { mediaFile } from "./media-disk";

const PREFIXES = ["news/"] as const;

export async function videoResponse(storageKey: string, rangeHeader: string | null): Promise<Response> {
  if (!localVideoUrl(`/media/${storageKey}`)) return new Response("Not found", { status: 404 });
  const local = mediaFile(storageKey);
  const localStat = local ? await stat(local).catch(() => null) : null;
  const remote = localStat?.isFile() ? null : remoteDiskFromEnv();
  const size = localStat?.isFile() ? localStat.size : remote ? await remoteFileSize(remote, storageKey, PREFIXES) : null;
  if (!size) return new Response("Not found", { status: 404 });
  const range = parseByteRange(rangeHeader, size);
  if (range === "invalid") return new Response(null, { status: 416, headers: { "content-range": `bytes */${size}`, "accept-ranges": "bytes" } });
  const start = range?.start ?? 0;
  const end = range?.end ?? size - 1;
  const stream = localStat?.isFile() && local ? createReadStream(local, { start, end }) : openRemoteRange(remote!, storageKey, PREFIXES, start, end - start + 1);
  const headers: Record<string, string> = {
    "content-type": "video/mp4",
    "content-length": String(end - start + 1),
    "accept-ranges": "bytes",
    "cache-control": "public, max-age=86400",
    "x-content-type-options": "nosniff",
  };
  if (range) headers["content-range"] = `bytes ${start}-${end}/${size}`;
  return new Response(Readable.toWeb(stream) as ReadableStream, { status: range ? 206 : 200, headers });
}
