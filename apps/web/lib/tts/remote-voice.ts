import "server-only";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { capSpeechText } from "./utterances";
import { packSpeechParts } from "./speech-parts";
import { speakDimitar } from "./dimitar";

const CACHE_DIR = path.join(process.cwd(), ".tts-cache");

const pending = new Map<string, Promise<Uint8Array>>();

export function speechCachePath(cacheKey: string): string {
  return path.join(CACHE_DIR, `${cacheKey.replace(/[^\w.-]+/g, "_")}.dimitar.parts`);
}

export async function bulgarianSpeech(cacheKey: string, text: string): Promise<Uint8Array> {
  const script = capSpeechText(text);
  if (!script) return new Uint8Array();
  const current = pending.get(cacheKey);
  if (current) return current;
  const job = loadOrSpeak(cacheKey, script).finally(() => {
    if (pending.get(cacheKey) === job) pending.delete(cacheKey);
  });
  pending.set(cacheKey, job);
  return job;
}

async function loadOrSpeak(cacheKey: string, text: string): Promise<Uint8Array> {
  const file = speechCachePath(cacheKey);
  try {
    return await readFile(file);
  } catch {
    /* generate below */
  }
  const wav = await speakDimitar(text);
  const audio = packSpeechParts([wav]);
  try {
    await mkdir(CACHE_DIR, { recursive: true });
    await writeFile(file, audio);
  } catch {
    /* the response still plays if the disk cache cannot be written */
  }
  return audio;
}
