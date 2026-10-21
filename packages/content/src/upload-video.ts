
import { spawn } from "node:child_process";
import { stat } from "node:fs/promises";

export const VIDEO_MAX_INPUT_BYTES = 200 * 1024 * 1024;
export const VIDEO_MAX_OUTPUT_BYTES = 85 * 1024 * 1024;
export const VIDEO_MAX_SECONDS = 300;
const VIDEO_TYPES = new Set(["video/mp4", "video/quicktime", "video/webm", "video/x-matroska"]);
const encoderOptions = new Map<string, Promise<string[]>>();

export function acceptsVideoType(value: string): boolean { return VIDEO_TYPES.has(value.toLowerCase()); }

/** Both supported software encoders produce browser-compatible H.264; no GPU assumption. */
function videoEncoder(binary: string): Promise<string[]> {
  let pending = encoderOptions.get(binary);
  if (!pending) {
    pending = run(binary, ["-hide_banner", "-encoders"], 20_000).then((listing) => {
      if (/^\s*V\S*\s+libx264(?:\s|$)/m.test(listing)) return ["-c:v", "libx264", "-preset", "fast", "-crf", "22"];
      if (/^\s*V\S*\s+libopenh264(?:\s|$)/m.test(listing)) return ["-c:v", "libopenh264", "-rc_mode", "bitrate", "-b:v", "1800k"];
      throw new Error("Видеото временно не може да бъде обработено на сървъра. Опитайте по-късно.");
    }).catch((error) => { encoderOptions.delete(binary); throw error; });
    encoderOptions.set(binary, pending);
  }
  return pending;
}

function run(binary: string, args: string[], timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    let error = "";
    let settled = false;
    const timer = setTimeout(() => child.kill(), timeoutMs);
    child.stdout.on("data", (part: Buffer) => { output += part.toString(); if (output.length > 128_000) child.kill(); });
    child.stderr.on("data", (part: Buffer) => { error = (error + part.toString()).slice(-4000); });
    child.on("error", cause => { if (!settled) { settled = true; clearTimeout(timer); reject(cause); } });
    child.on("close", code => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;
      if (code === 0) resolve(output);
      else reject(new Error(`video processing failed: ${error.slice(-500)}`));
    });
  });
}

export async function inspectVideo(path: string): Promise<{ duration: number; width: number; height: number }> {
  const probe = JSON.parse(await run(process.env.FFPROBE_PATH || "ffprobe", ["-v", "error", "-show_entries", "format=duration:stream=codec_type,width,height", "-of", "json", path], 20_000)) as {
    format?: { duration?: string }; streams?: { codec_type?: string; width?: number; height?: number }[];
  };
  const video = probe.streams?.find(stream => stream.codec_type === "video");
  const duration = Number(probe.format?.duration);
  if (!video?.width || !video.height || video.width > 8192 || video.height > 8192 || !Number.isFinite(duration) || duration <= 0 || duration > VIDEO_MAX_SECONDS) {
    throw new Error("Видеото трябва да е валидно и с продължителност до 5 минути.");
  }
  return { duration, width: video.width, height: video.height };
}

export async function optimizeVideo(input: string, output: string): Promise<{ duration: number; width: number; height: number; bytes: number }> {
  await inspectVideo(input);
  const binary = process.env.FFMPEG_PATH || "ffmpeg";
  const encoder = await videoEncoder(binary);
  await run(binary, [
    "-hide_banner", "-loglevel", "error", "-nostdin", "-y", "-i", input,
    "-map", "0:v:0", "-map", "0:a:0?", "-map_metadata", "-1", "-map_chapters", "-1",
    "-vf", "scale=w='min(1280,iw)':h='min(720,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2:flags=lanczos",
    ...encoder, "-maxrate", "2000k", "-bufsize", "4000k", "-pix_fmt", "yuv420p", "-threads", "2",
    "-c:a", "aac", "-b:a", "128k", "-ac", "2", "-movflags", "+faststart", "-f", "mp4", output,
  ], 10 * 60_000);
  const info = await inspectVideo(output);
  const bytes = (await stat(output)).size;
  if (bytes < 1 || bytes > VIDEO_MAX_OUTPUT_BYTES) throw new Error("Оптимизираното видео е твърде голямо. Изберете по-кратък или по-лек клип.");
  return { ...info, bytes };
}
