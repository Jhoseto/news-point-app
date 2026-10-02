import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
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
  const svg = Buffer.from(`<svg width="1200" height="1200" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="shade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#050b22" stop-opacity=".25"/><stop offset="1" stop-color="#050b22" stop-opacity=".94"/></linearGradient></defs><rect width="1200" height="1200" fill="url(#shade)"/><circle cx="120" cy="126" r="49" fill="none" stroke="#a82df1" stroke-width="12"/><circle cx="120" cy="126" r="30" fill="none" stroke="#14b9f8" stroke-width="10"/><text x="195" y="143" font-family="Arial,sans-serif" font-size="55" font-weight="800" fill="white">NewsPoint.bg</text><text x="82" y="1080" font-family="Arial,sans-serif" font-size="43" letter-spacing="8" fill="#70d5ff">PODCAST</text>${lines}</svg>`);
  return sharp(background, { limitInputPixels: 40_000_000 }).resize(1200, 1200, { fit: "cover" }).composite([{ input: svg }]).webp({ quality: 86 }).toBuffer();
}

export async function masterAudio(wavs: Buffer[], music: Buffer | null): Promise<{ bytes: Buffer; durationSec: number }> {
  if (!wavs.length) throw new Error("No voice segments");
  const dir = await mkdtemp(join(tmpdir(), "np-ai-podcast-"));
  try {
    const inputs: string[] = [];
    for (let i = 0; i < wavs.length; i++) {
      const path = join(dir, `voice-${i}.wav`);
      await writeFile(path, wavs[i]!);
      inputs.push("-i", path);
    }
    if (music) {
      const path = join(dir, "music.mp3");
      await writeFile(path, music);
      inputs.push("-stream_loop", "-1", "-i", path);
    }
    const voice = `${wavs.map((_, index) => `[${index}:a]`).join("")}concat=n=${wavs.length}:v=0:a=1,aresample=48000,aformat=channel_layouts=stereo[spoken]`;
    const filter = music
      ? `${voice};[spoken]asplit=2[voice_mix][side];[${wavs.length}:a]aresample=48000,aformat=channel_layouts=stereo,volume=0.13[bed];[bed][side]sidechaincompress=threshold=0.03:ratio=8:attack=30:release=600[duck];[voice_mix][duck]amix=inputs=2:duration=first:dropout_transition=0,loudnorm=I=-16:TP=-1.5:LRA=11,alimiter=limit=0.84[out]`
      : `${voice};[spoken]loudnorm=I=-16:TP=-1.5:LRA=11,alimiter=limit=0.84[out]`;
    const out = join(dir, "master.mp3");
    await run(process.env.FFMPEG_PATH || "ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...inputs, "-filter_complex", filter, "-map", "[out]", "-ar", "48000", "-ac", "2", "-b:a", "128k", out], 600_000);
    const probe = await run(process.env.FFPROBE_PATH || "ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", out], 30_000);
    const durationSec = Math.round(Number(probe.trim()));
    const bytes = await readFile(out);
    if (!Number.isFinite(durationSec) || durationSec < 1 || bytes.length > 80 * 1024 * 1024) throw new Error("Invalid mastered audio");
    return { bytes, durationSec };
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
