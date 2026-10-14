import "server-only";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { PODCAST_AUDIO_MAX_BYTES } from "./podcast-file";
import type { PodcastAudioExtension } from "./podcast-file";
type SpeechFormat = "opus" | "aac";

const run = promisify(execFile);
const options = { windowsHide: true, timeout: 120_000, maxBuffer: 256_000 };
const podcastInputOptions = ["-protocol_whitelist", "file,pipe", "-format_whitelist", "mp3,mov,wav,flac", "-max_streams", "8"];

type AudioInfo = { duration: number; channels: number; sampleRate: number; codec: string; bitrate: number; container: string };

async function inspectAudio(file: string): Promise<AudioInfo> {
  const { stdout } = await run(process.env.FFPROBE_PATH || "ffprobe", [
    "-v", "error", ...podcastInputOptions, "-show_entries",
    "format=duration,format_name:stream=codec_type,codec_name,channels,sample_rate,bit_rate:stream_disposition=attached_pic",
    "-of", "json", file,
  ], options);
  const probe = JSON.parse(stdout) as { format?: { duration?: string; format_name?: string }; streams?: Array<{ codec_type?: string; codec_name?: string; channels?: number; sample_rate?: string; bit_rate?: string; disposition?: { attached_pic?: number } }> };
  const tracks = probe.streams?.filter(track => track.codec_type === "audio") ?? [];
  const track = tracks[0];
  const duration = Number(probe.format?.duration);
  if (tracks.length !== 1 || !track || ![1, 2].includes(track.channels ?? 0) || !Number.isFinite(duration) || duration <= 0 || duration > 21_600 || probe.streams?.some(stream => stream.codec_type === "video" && !stream.disposition?.attached_pic)) {
    throw new Error("Качете валиден моно или стерео звуков файл до 6 часа.");
  }
  const sampleRate = Number(track.sample_rate);
  if (!Number.isFinite(sampleRate) || sampleRate < 8000 || sampleRate > 192000) throw new Error("Невалиден звуков файл.");
  return { duration, channels: track.channels!, sampleRate, codec: track.codec_name ?? "", bitrate: Number(track.bit_rate) || 0, container: probe.format?.format_name ?? "" };
}

/** Store one podcast delivery file; temp originals never enter media storage. */
export async function preparePodcastAudio(bytes: Buffer, name: string): Promise<{ buffer: Buffer; extension: PodcastAudioExtension; durationSec: number; originalBytes: number; optimized: boolean }> {
  if (!bytes.length || bytes.length > PODCAST_AUDIO_MAX_BYTES || !/\.(mp3|m4a|wav|flac)$/i.test(name)) throw new Error("Качете MP3, M4A, WAV или FLAC до 80 MB.");
  const directory = await mkdtemp(path.join(tmpdir(), "np-podcast-audio-"));
  try {
    const input = path.join(/* turbopackIgnore: true */ directory, "input.audio");
    await writeFile(input, bytes, { mode: 0o600 });
    const source = await inspectAudio(input);
    if (!/^(mp3|aac|flac|pcm_(s16le|s24le|s32le|f32le|f64le|u8))$/.test(source.codec)) throw new Error("Неподдържан звуков формат.");
    const rate = Math.min(48000, source.sampleRate);
    const bitrate = source.channels === 1 ? (rate <= 24000 ? 64 : 96) : (rate <= 24000 ? 96 : 128);
    const originalExtension: PodcastAudioExtension | null = source.codec === "mp3" && source.container === "mp3" ? "mp3" : source.codec === "aac" && source.container.includes("mp4") ? "m4a" : null;
    const copy = originalExtension != null && source.bitrate > 0 && source.bitrate <= bitrate * 1000 * 1.15;
    const extension = copy ? originalExtension! : "m4a";
    const output = path.join(/* turbopackIgnore: true */ directory, `encoded.${extension}`);
    await run(process.env.FFMPEG_PATH || "ffmpeg", [
      "-hide_banner", "-loglevel", "error", "-nostdin", "-y", ...podcastInputOptions, "-i", input,
      "-map", "0:a:0", "-map_metadata", "0", "-map_chapters", "0", "-vn",
      ...(copy ? ["-c:a", "copy"] : ["-ac", String(source.channels), "-ar", String(rate), "-c:a", "aac", "-profile:a", "aac_low", "-b:a", `${bitrate}k`]),
      ...(extension === "m4a" ? ["-movflags", "+faststart"] : []), output,
    ], options);
    const result = await readFile(/* turbopackIgnore: true */ output);
    const inspected = await inspectAudio(output);
    if (!result.length || result.length > PODCAST_AUDIO_MAX_BYTES || Math.abs(inspected.duration - source.duration) > 0.25 || inspected.channels !== source.channels) throw new Error("Оптимизирането на звука не мина проверката.");
    // Avoid lossy recoding for negligible savings, or any larger delivery file.
    if (originalExtension && result.length >= bytes.length * (copy ? 1 : 0.90)) {
      return { buffer: bytes, extension: originalExtension, durationSec: Math.max(1, Math.round(source.duration)), originalBytes: bytes.length, optimized: false };
    }
    return { buffer: result, extension, durationSec: Math.max(1, Math.round(inspected.duration)), originalBytes: bytes.length, optimized: result.length < bytes.length };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

/** Fail before a paid generation if the speech encoder is unavailable. */
export async function checkSpeechEncoder(format: SpeechFormat): Promise<void> {
  const encoder = format === "opus" ? "libopus" : "aac";
  const { stdout } = await run(process.env.FFMPEG_PATH || "ffmpeg", ["-hide_banner", "-h", `encoder=${encoder}`], options);
  if (!stdout.includes(`Encoder ${encoder}`)) throw new Error(`TTS requires FFmpeg with ${encoder}.`);
}

/** Keep complete, independently decodable pieces (including gapless metadata). */
export async function compressSpeechParts(parts: readonly Uint8Array[], format: SpeechFormat): Promise<Uint8Array[]> {
  const directory = await mkdtemp(path.join(tmpdir(), "np-tts-"));
  try {
    const output: Uint8Array[] = [];
    for (const [index, part] of parts.entries()) {
      // Generated private temp files are runtime assets, never build inputs.
      const input = path.join(/* turbopackIgnore: true */ directory, `${index}.wav`);
      const encoded = path.join(/* turbopackIgnore: true */ directory, `${index}.${format === "opus" ? "webm" : "m4a"}`);
      await writeFile(input, part, { mode: 0o600 });
      await run(process.env.FFMPEG_PATH || "ffmpeg", [
        "-hide_banner", "-loglevel", "error", "-nostdin", "-y", "-protocol_whitelist", "file,pipe", "-i", input,
        "-map", "0:a:0", "-map_metadata", "-1", "-vn",
        "-ac", "1", "-ar", "24000",
        ...(format === "opus"
          ? ["-c:a", "libopus", "-b:a", "40k", "-vbr", "on", "-application", "audio", "-compression_level", "10"]
          : ["-c:a", "aac", "-b:a", "64k", "-profile:a", "aac_low", "-movflags", "+faststart"]),
        encoded,
      ], options);
      const bytes = await readFile(/* turbopackIgnore: true */ encoded);
      if (!bytes.length) throw new Error("Empty compressed speech.");
      output.push(bytes);
    }
    return output;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
