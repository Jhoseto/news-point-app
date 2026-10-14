import "server-only";
import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { access, mkdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { unpackSpeechParts } from "./speech-parts";
import { speechEncodingProfile, type SpeechFormat } from "./speech-format";

export function speechCacheDirectory(): string {
  const configured = process.env.TTS_CACHE_DIR?.trim();
  if (configured) {
    if (!path.isAbsolute(configured)) throw new Error("TTS_CACHE_DIR must be an absolute private directory.");
    return configured;
  }
  return process.env.NODE_ENV === "production"
    ? path.join(homedir(), ".cache", "newspoint", "tts")
    : path.join(process.cwd(), ".tts-cache");
}

function filename(cacheKey: string, format?: SpeechFormat): string {
  return `${cacheKey.replace(/[^\w.-]+/g, "_")}.glite4${format ? `.${speechEncodingProfile(format)}` : ""}.parts`;
}

export function speechCachePath(cacheKey: string, format: SpeechFormat = "aac"): string {
  return path.join(speechCacheDirectory(), filename(cacheKey, format));
}

export function speechSourceCachePath(cacheKey: string): string {
  return path.join(speechCacheDirectory(), filename(cacheKey));
}

async function readCache(file: string): Promise<Uint8Array | null> {
  try {
    const bytes = await readFile(file);
    if (!unpackSpeechParts(bytes).length) throw new Error("Empty speech cache.");
    return bytes;
  } catch (error) {
    // Permission/corruption errors must never silently trigger another paid job.
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export function readCompressedSpeech(cacheKey: string, format: SpeechFormat): Promise<Uint8Array | null> {
  return readCache(speechCachePath(cacheKey, format));
}

export async function readSourceSpeech(cacheKey: string): Promise<Uint8Array | null> {
  const current = await readCache(speechSourceCachePath(cacheKey));
  if (current) return current;
  const legacy = path.join(process.cwd(), ".tts-cache", filename(cacheKey));
  return legacy === speechSourceCachePath(cacheKey) ? null : readCache(legacy);
}

export async function hasCachedSpeech(cacheKey: string, format: SpeechFormat = "aac"): Promise<boolean> {
  const candidates = new Set([speechCachePath(cacheKey, format), speechSourceCachePath(cacheKey), path.join(process.cwd(), ".tts-cache", filename(cacheKey))]);
  for (const file of candidates) {
    try {
      await access(file, constants.R_OK);
      if ((await stat(file)).size < 4) throw new Error("Empty speech cache.");
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  return false;
}

export async function writeSpeechCache(file: string, bytes: Uint8Array): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, bytes, { mode: 0o600, flag: "wx" });
    await rename(temporary, file);
  } finally {
    await unlink(temporary).catch(error => {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    });
  }
}

/** Detect missing space/permissions before reaching the paid provider. */
export async function checkSpeechCacheWritable(): Promise<void> {
  const probe = path.join(speechCacheDirectory(), `.probe-${randomUUID()}`);
  await mkdir(path.dirname(probe), { recursive: true, mode: 0o700 });
  await writeFile(probe, new Uint8Array([0]), { mode: 0o600, flag: "wx" });
  await unlink(probe);
}
