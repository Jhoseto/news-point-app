export type AudioPlan =
  | { status: 404 }
  | { status: 416; headers: Record<string, string> }
  | { status: 200 | 206; start: number; end: number; headers: Record<string, string> };

/** Headers for one MP3 response. An empty file is missing, not a partial range. */
export function planPodcastAudio(size: number, rangeHeader: string | null, downloadName: string | null): AudioPlan {
  if (!Number.isInteger(size) || size < 1) return { status: 404 };
  const range = parseByteRange(rangeHeader, size);
  if (range === "invalid") return { status: 416, headers: { "content-range": `bytes */${size}`, "accept-ranges": "bytes" } };
  const start = range?.start ?? 0;
  const end = range?.end ?? size - 1;
  const headers: Record<string, string> = {
    "content-type": "audio/mpeg",
    "content-length": String(end - start + 1),
    "accept-ranges": "bytes",
    "cache-control": "public, max-age=86400",
    "x-content-type-options": "nosniff",
  };
  if (range) headers["content-range"] = `bytes ${start}-${end}/${size}`;
  if (downloadName && /^[a-z0-9]+(?:-[a-z0-9]+)*\.mp3$/.test(downloadName)) {
    headers["content-disposition"] = `attachment; filename="${downloadName}"`;
  }
  return { status: range ? 206 : 200, start, end, headers };
}

/** One byte range for an audio response. `null` means the whole file. */
export function parseByteRange(header: string | null, size: number): { start: number; end: number } | null | "invalid" {
  if (!header) return null;
  if (size <= 0 || header.includes(",")) return "invalid";
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return "invalid";
  const startRaw = match[1] ?? "";
  const endRaw = match[2] ?? "";
  if (!startRaw && !endRaw) return "invalid";
  if (!startRaw) {
    const suffix = Number(endRaw);
    if (!Number.isInteger(suffix) || suffix <= 0) return "invalid";
    const length = Math.min(suffix, size);
    return { start: size - length, end: size - 1 };
  }
  const start = Number(startRaw);
  const end = endRaw === "" ? size - 1 : Number(endRaw);
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || start >= size || end < start) return "invalid";
  return { start, end: Math.min(end, size - 1) };
}
