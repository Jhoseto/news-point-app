import "server-only";
import { execFile, spawn } from "node:child_process";
import { open, readFile, rm } from "node:fs/promises";
import { isAbsolute } from "node:path";
import { createInterface } from "node:readline";
import { promisify } from "node:util";
import { videoEncoder } from "@newspoint/content/upload-media";
import sharp from "sharp";

const run = promisify(execFile);
const fps = 30;
const audioInput = ["-protocol_whitelist", "file", "-format_whitelist", "mp3,mov", "-max_streams", "8"];
const sampling = { windowsHide: true, timeout: 30_000, maxBuffer: 64 * 1024 };

type ExportOptions = {
  audioPath: string;
  coverPath: string;
  outputPath: string;
  signal: AbortSignal;
  onProgress: (percent: number) => void;
};

type Track = { codec_type: string; codec_name: string; duration?: string; width?: number; height?: number };

async function inspect(file: string, signal: AbortSignal) {
  const { stdout } = await run(process.env.FFPROBE_PATH || "ffprobe", [
    "-v", "error", ...audioInput, "-show_entries", "format=duration:stream=codec_type,codec_name,duration,width,height",
    "-of", "json", file,
  ], { ...sampling, signal, killSignal: "SIGKILL" });
  return JSON.parse(stdout) as { format?: { duration?: string }; streams: Track[] };
}

// Without a Xing/VBRI header an MP3 container duration can be an estimate.
// Count decoded audio samples before reporting a percentage for legacy MP3s.
async function measureMp3(binary: string, path: string, signal: AbortSignal) {
  const { stdout } = await run(binary, [
    "-v", "error", "-xerror", "-nostdin", "-nostats", "-stats_period", "3600", "-progress", "pipe:1",
    ...audioInput, "-i", path, "-map", "0:a:0", "-af", "asetpts=N/SR/TB", "-f", "null", "-",
  ], { ...sampling, timeout: 120_000, signal, killSignal: "SIGKILL" });
  const final = Array.from(stdout.matchAll(/^out_time_us=(\d+)\r?$/gm)).at(-1);
  return Number(final?.[1]) / 1_000_000;
}

// Compose the still once, including a full, uncropped cover. Only the small
// spectrum changes between frames, leaving the encoder a mostly static canvas.
async function composeSleeve(coverPath: string, signal: AbortSignal) {
  const bytes = await readFile(/* turbopackIgnore: true */ coverPath, { signal });
  const cover = sharp(bytes, { limitInputPixels: 60_000_000, animated: false }).rotate();
  const [backdrop, art] = await Promise.all([
    cover.clone().resize(270, 480, { fit: "cover" }).removeAlpha().blur(19).modulate({ saturation: 0.68 }).png().toBuffer(),
    cover.clone().resize(896, 1016, { fit: "inside" }).png().toBuffer({ resolveWithObject: true }),
  ]);
  const left = Math.round((1080 - art.info.width) / 2);
  const top = Math.round((1920 - art.info.height - 176) / 2);
  const pixels = await sharp(backdrop).resize(1080, 1920)
    .composite([
      { input: { create: { width: 1080, height: 1920, channels: 4, background: { r: 8, g: 15, b: 41, alpha: 0.81 } } } },
      { input: { create: { width: art.info.width + 2, height: art.info.height + 2, channels: 4, background: { r: 188, g: 194, b: 220, alpha: 0.22 } } }, left: left - 1, top: top - 1 },
      { input: art.data, left, top },
    ]).removeAlpha().png().toBuffer();
  return { pixels, spectrumTop: top + art.info.height + 32 };
}

// Log-spaced FFT buckets share the audio clock. Scaling each bucket to a bar
// keeps the graph legible on a phone. Stereo channels contribute independently.
function spectrumGraph(top: number) {
  return [
    `[0:v]format=yuv420p,setsar=1,loop=loop=-1:size=1:start=0,setpts=N/(${fps}*TB)[sleeve]`,
    "[1:a:0]asetpts=PTS-STARTPTS,asplit[audio][analysis]",
    `[analysis]aresample=48000,showfreqs=s=44x264:r=${fps}:mode=bar:fscale=log:ascale=log:` +
      "win_size=2048:win_func=hann:overlap=0.75:averaging=2:colors=0xbdb2ff|0xbdb2ff," +
      "crop=44:144:0:0,scale=704:144:flags=neighbor,format=rgba,drawgrid=w=16:h=288:y=144:t=5:c=black@0:replace=1[spectrum]",
    `[sleeve][spectrum]overlay=x=188:y=${top}:shortest=1,format=yuv420p[video]`,
  ].join(";");
}

async function encode(options: ExportOptions, sleeve: Awaited<ReturnType<typeof composeSleeve>>, duration: number, binary: string, encoder: string[]) {
  const { signal, audioPath, outputPath, onProgress } = options;
  const args = [
    "-hide_banner", "-loglevel", "error", "-xerror", "-nostdin", "-y", "-nostats", "-stats_period", "0.5", "-progress", "pipe:1",
    "-filter_complex_threads", "2",
    "-f", "image2pipe", "-vcodec", "png", "-framerate", String(fps), "-protocol_whitelist", "pipe", "-i", "pipe:0",
    ...audioInput, "-i", audioPath, "-filter_complex", spectrumGraph(sleeve.spectrumTop), "-map", "[video]", "-map", "[audio]",
    "-map_metadata", "-1", "-map_chapters", "-1", ...encoder, "-threads", "2", "-maxrate", "3000k",
    "-bufsize", "6000k", "-g", String(fps * 4), "-pix_fmt", "yuv420p", "-r", String(fps),
    "-c:a", "aac", "-b:a", "128k", "-ar", "48000", "-movflags", "+faststart", "-f", "mp4", outputPath,
  ];
  signal.throwIfAborted();
  await new Promise<void>((resolve, reject) => {
    const process = spawn(/* turbopackIgnore: true */ binary, args, { windowsHide: true, stdio: "pipe", signal, killSignal: "SIGKILL" });
    const progress = createInterface({ input: process.stdout });
    let reported = 0;
    let stderr = "";
    let error: Error | undefined;
    progress.on("line", (line) => {
      const match = /^out_time_us=(\d+)$/.exec(line);
      if (!match) return;
      const percent = Math.min(99, Math.floor(Number(match[1]) / (duration * 10_000)));
      if (percent <= reported) return;
      reported = percent;
      onProgress(percent);
    });
    process.stderr.on("data", (part: Buffer) => { stderr = (stderr + part.toString()).slice(-2000); });
    process.on("error", (cause) => { error = cause; });
    // Missing encoders or cancellation may close stdin before the PNG is written.
    process.stdin.on("error", () => {});
    process.once("close", (code) => {
      progress.close();
      if (code === 0 && !error && !signal.aborted) resolve();
      else reject(error ?? new Error(`Podcast video encoding failed: ${stderr}`));
    });
    process.stdin.end(sleeve.pixels);
  });
}

/** Writes a private, new MP4; resolution means both complete tracks were verified. */
export async function renderPodcastTikTok(options: ExportOptions): Promise<void> {
  const { audioPath, coverPath, outputPath, signal, onProgress } = options;
  if (![audioPath, coverPath, outputPath].every(file => isAbsolute(file) && !/^[\\/]{2}/.test(file))) throw new Error("Expected local media paths");
  signal.throwIfAborted();
  onProgress(0);
  const binary = process.env.FFMPEG_PATH || "ffmpeg";
  const [source, encoder, sleeve] = await Promise.all([
    inspect(audioPath, signal), videoEncoder(binary), composeSleeve(coverPath, signal),
  ]);
  const track = source.streams.find(stream => stream.codec_type === "audio");
  if (!track || !["aac", "mp3"].includes(track.codec_name)) throw new Error("Invalid podcast audio");
  const duration = track.codec_name === "mp3" ? await measureMp3(binary, audioPath, signal) : Number(track.duration ?? source.format?.duration);
  if (!Number.isFinite(duration) || duration <= 0 || duration > 21_601) {
    throw new Error("Invalid podcast audio");
  }
  signal.throwIfAborted();
  // Reserve exclusively before FFmpeg writes. Failed exports never remove an existing file.
  const handle = await open(/* turbopackIgnore: true */ outputPath, "wx", 0o600);
  try {
    await handle.close();
    await encode(options, sleeve, duration, binary, encoder);
    const result = await inspect(outputPath, signal);
    const video = result.streams.find(stream => stream.codec_type === "video");
    const audio = result.streams.find(stream => stream.codec_type === "audio");
    const complete = (stream?: Track) => Number.isFinite(Number(stream?.duration)) && Math.abs(Number(stream?.duration) - duration) <= 0.2;
    if (video?.codec_name !== "h264" || video.width !== 1080 || video.height !== 1920 || audio?.codec_name !== "aac" || !complete(video) || !complete(audio)) {
      throw new Error("Incomplete podcast video");
    }
  } catch (error) {
    await rm(/* turbopackIgnore: true */ outputPath, { force: true });
    throw error;
  }
}
