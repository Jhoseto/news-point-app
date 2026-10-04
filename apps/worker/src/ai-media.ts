import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { remoteDiskFromEnv, readRemoteFile, writeRemoteFile } from "@newspoint/content/disk";
import sharp from "sharp";

const PREFIXES = ["podcasts/", "ai-podcasts/"] as const;

export function aiStorageKey(extension: "wav" | "mp3" | "webp", projectId?: string): string {
  const now = new Date();
  const folder = projectId ? `ai-podcasts/${projectId}` : `ai-podcasts/assets/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  return `${folder}/${randomUUID()}.${extension}`;
}

export function publicPodcastKey(extension: "mp3" | "webp"): string {
  const now = new Date();
  return `podcasts/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${randomUUID()}.${extension}`;
}

function localPath(key: string) {
  const root = process.env.MEDIA_ROOT?.trim();
  if (!root || !PREFIXES.some((prefix) => key.startsWith(prefix)) || key.split("/").some((part) => !part || part === "." || part === "..")) throw new Error("Media storage unavailable");
  const full = resolve(root, ...key.split("/"));
  if (!full.startsWith(resolve(root) + (process.platform === "win32" ? "\\" : "/"))) throw new Error("Invalid media path");
  return full;
}

export async function saveMedia(key: string, bytes: Buffer) {
  const remote = remoteDiskFromEnv();
  if (remote) return writeRemoteFile(remote, key, bytes, PREFIXES);
  const path = localPath(key);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, bytes);
}

export async function loadMedia(key: string): Promise<Buffer> {
  const remote = remoteDiskFromEnv();
  const bytes = remote ? await readRemoteFile(remote, key, PREFIXES) : await readFile(localPath(key));
  if (!bytes) throw new Error(`Missing media ${key}`);
  return bytes;
}

function escapeXml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function titleLines(title: string): string[] {
  const words = title.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  while (words.length && lines.length < 4) {
    let line = words.shift()!;
    while (words.length && `${line} ${words[0]}`.length <= 21) line += ` ${words.shift()!}`;
    lines.push(line);
  }
  if (words.length) lines[lines.length - 1] = `${lines[lines.length - 1]!.slice(0, 17)}…`;
  return lines;
}

export async function brandedCover(background: Buffer, title: string): Promise<Buffer> {
  const lines = titleLines(title).map((line, index) => `<text x="82" y="${600 + index * 95}" font-family="Arial,sans-serif" font-weight="800" font-size="76" fill="white">${escapeXml(line)}</text>`).join("");
  const svg = Buffer.from(`<svg width="1200" height="1200" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="shade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#050b22" stop-opacity=".25"/><stop offset="1" stop-color="#050b22" stop-opacity=".94"/></linearGradient></defs><rect width="1200" height="1200" fill="url(#shade)"/><rect x="58" y="64" width="690" height="238" rx="26" fill="#ffffff" fill-opacity=".94"/><text x="82" y="1080" font-family="Arial,sans-serif" font-size="43" letter-spacing="8" fill="#70d5ff">PODCAST</text>${lines}</svg>`);
  const logo = await readFile(fileURLToPath(new URL("../../studio/public/brand/newspoint-logo-512w.webp", import.meta.url)));
  const logoOverlay = await sharp(logo).resize({ width: 640 }).toBuffer();
  return sharp(background, { limitInputPixels: 40_000_000 }).resize(1200, 1200, { fit: "cover" }).composite([{ input: svg }, { input: logoOverlay, left: 84, top: 82 }]).webp({ quality: 86 }).toBuffer();
}

export async function assertAudioTools(): Promise<void> {
  const ffmpeg = process.env.FFMPEG_PATH || "ffmpeg";
  const ffprobe = process.env.FFPROBE_PATH || "ffprobe";
  const [filters, encoders] = await Promise.all([
    run(ffmpeg, ["-hide_banner", "-filters"], 15_000),
    run(ffmpeg, ["-hide_banner", "-encoders"], 15_000),
    run(ffprobe, ["-version"], 15_000),
  ]);
  for (const name of ["loudnorm", "sidechaincompress", "alimiter", "atempo"]) {
    if (!filters.includes(name)) throw new Error(`FFmpeg filter ${name} is unavailable`);
  }
  if (!encoders.includes("libmp3lame")) throw new Error("FFmpeg encoder libmp3lame is unavailable");
}

export function planPodcastTempo(voiceSeconds: number, targetSeconds: number, fixedSeconds = 0): number {
  if (!Number.isFinite(voiceSeconds) || voiceSeconds <= 0 || !Number.isFinite(targetSeconds) || targetSeconds <= fixedSeconds + 10) return 1;
  const estimated = voiceSeconds + fixedSeconds;
  const lower = targetSeconds * .9 + 4;
  const upper = targetSeconds * 1.1 - 4;
  if (estimated >= lower && estimated <= upper) return 1;
  const desired = estimated < lower ? lower : upper;
  return Math.max(.94, Math.min(1.06, voiceSeconds / (desired - fixedSeconds)));
}

export async function masterAudio(wavs: Buffer[], music: Buffer | null, targetSeconds?: number): Promise<{ bytes: Buffer; durationSec: number; tempo: number }> {
  if (!wavs.length) throw new Error("No voice segments");
  const dir = await mkdtemp(join(tmpdir(), "np-ai-podcast-"));
  try {
    const inputs: string[] = [];
    for (let i = 0; i < wavs.length; i++) {
      const path = join(dir, `voice-${i}.wav`);
      await writeFile(path, wavs[i]!);
      inputs.push("-i", path);
    }
    const seconds = await Promise.all(wavs.map((_, i) => run(process.env.FFPROBE_PATH || "ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", join(dir, `voice-${i}.wav`)], 30_000).then((value) => Number(value.trim()))));
    if (seconds.some((value) => !Number.isFinite(value) || value <= 0)) throw new Error("Invalid voice segment duration");
    if (music) {
      const path = join(dir, "music.mp3");
      await writeFile(path, music);
      inputs.push("-stream_loop", "-1", "-i", path);
    }
    const speechSeconds = seconds.reduce((sum, value) => sum + value, 0) + (wavs.length - 1) * 0.18;
    const fixedSeconds = music ? 2 : 0;
    const tempo = targetSeconds ? planPodcastTempo(speechSeconds, targetSeconds, fixedSeconds) : 1;
    const pauses = wavs.map((_, index) => `[${index}:a]${index === wavs.length - 1 ? "anull" : "apad=pad_dur=0.18"}[voice${index}]`).join(";");
    const voice = `${pauses};${wavs.map((_, index) => `[voice${index}]`).join("")}concat=n=${wavs.length}:v=0:a=1${tempo === 1 ? "" : `,atempo=${tempo.toFixed(5)}`},aresample=48000,aformat=channel_layouts=stereo${music ? ",adelay=1000|1000,apad=pad_dur=1" : ""}[spoken]`;
    const totalSeconds = speechSeconds / tempo + fixedSeconds;
    const filter = music
      ? `${voice};[spoken]asplit=2[voice_mix][side];[${wavs.length}:a]aresample=48000,aformat=channel_layouts=stereo,volume=0.13,afade=t=in:st=0:d=0.6,afade=t=out:st=${Math.max(0, totalSeconds - 0.8).toFixed(2)}:d=0.8[bed];[bed][side]sidechaincompress=threshold=0.03:ratio=8:attack=30:release=600[duck];[voice_mix][duck]amix=inputs=2:duration=first:dropout_transition=0,loudnorm=I=-16:TP=-1.5:LRA=11,alimiter=limit=0.72:level=false[out]`
      : `${voice};[spoken]loudnorm=I=-16:TP=-1.5:LRA=11,alimiter=limit=0.72:level=false[out]`;
    const out = join(dir, "master.mp3");
    await run(process.env.FFMPEG_PATH || "ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...inputs, "-filter_complex", filter, "-map", "[out]", "-ar", "48000", "-ac", "2", "-b:a", "128k", out], 600_000);
    const probe = await run(process.env.FFPROBE_PATH || "ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", out], 30_000);
    const durationSec = Math.round(Number(probe.trim()));
    const bytes = await readFile(out);
    if (!Number.isFinite(durationSec) || durationSec < 1 || bytes.length > 80 * 1024 * 1024) throw new Error("Invalid mastered audio");
    return { bytes, durationSec, tempo };
  } finally { await rm(dir, { recursive: true, force: true }); }
}

function run(program: string, args: string[], timeout: number): Promise<string> {
  return new Promise((resolveRun, reject) => {
    const child = spawn(program, args, { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let error = "";
    const timer = setTimeout(() => child.kill(), timeout);
    child.stdout.on("data", (bytes: Buffer) => { out += bytes.toString(); });
    child.stderr.on("data", (bytes: Buffer) => { error = (error + bytes.toString()).slice(-4000); });
    child.on("error", (reason) => { clearTimeout(timer); reject(reason); });
    child.on("close", (code) => { clearTimeout(timer); code === 0 ? resolveRun(out) : reject(new Error(`${program} failed: ${error || code}`)); });
  });
}
