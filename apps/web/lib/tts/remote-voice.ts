import "server-only";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { capSpeechText } from "./utterances";
import { newsSpeechTurns, packSpeechParts, speechByteChunks } from "./speech-parts";

const CACHE_DIR = path.join(process.cwd(), ".tts-cache");
const API = "https://generativelanguage.googleapis.com/v1beta/interactions";
const MODEL = "gemini-3.8-flash-lite-tts";
const VOICE = "Charon";
const STYLE = [
  "Brisk news pace, clearly faster than conversation. Speaking rapidly, words still distinct, not breathless.",
  "Bulgarian television news anchor in standard Sofia pronunciation, never Russian and never English.",
  "Stress every word on its correct Bulgarian syllable, not the Russian cognate.",
  "Keep ъ, ж, ч, ш and щ distinct, and do not swallow unstressed vowels.",
  "Steady authoritative tone, a small rise before each comma, a clear fall at the end of each sentence.",
  "No smile, no drama, no chatter.",
].join(" ");

const pending = new Map<string, Promise<Uint8Array>>();

type GeminiAudio = {
  steps?: Array<{ type?: string; content?: Array<{ type?: string; data?: string }> }>;
  error?: { message?: string };
};

export function speechCachePath(cacheKey: string): string {
  return path.join(CACHE_DIR, `${cacheKey.replace(/[^\w.-]+/g, "_")}.glite4.parts`);
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
  const parts = await speakGemini(text);
  const audio = packSpeechParts(parts);
  try {
    await mkdir(CACHE_DIR, { recursive: true });
    await writeFile(file, audio);
  } catch {
    /* the response still plays if the disk cache cannot be written */
  }
  return audio;
}

async function speakGemini(text: string): Promise<Uint8Array[]> {
  const key = process.env.GOOGLE_AI_STUDIO?.trim();
  if (!key) throw new Error("Липсва GOOGLE_AI_STUDIO.");
  const chunks = speechByteChunks(text, 8_000);
  const out = new Array<Uint8Array>(chunks.length);
  let cursor = 0;
  async function worker(apiKey: string) {
    while (cursor < chunks.length) {
      const index = cursor;
      cursor += 1;
      const piece = chunks[index];
      if (!piece) continue;
      out[index] = await requestGemini(piece, apiKey);
    }
  }
  await Promise.all(Array.from({ length: Math.min(2, chunks.length) }, () => worker(key)));
  return out.filter((part) => part && part.byteLength > 0);
}

async function requestGemini(text: string, key: string): Promise<Uint8Array> {
  const response = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      model: MODEL,
      input: [{
        type: "user_input",
        content: newsSpeechTurns(text).map((turn) => ({
          type: "text",
          text: turn,
          annotations: [{ type: "speech_metadata", style: STYLE }],
        })),
      }],
      response_format: { type: "audio" },
      generation_config: { speech_config: [{ voice: VOICE }] },
    }),
    signal: AbortSignal.timeout(120_000),
  });
  const payload = (await response.json().catch(() => null)) as GeminiAudio | null;
  if (!response.ok || !payload) {
    const detail = payload?.error?.message?.slice(0, 180);
    throw new Error(detail ? `Gemini TTS ${response.status}: ${detail}` : `Gemini TTS ${response.status}`);
  }
  const blocks = payload.steps?.filter((step) => step.type === "model_output").flatMap((step) => step.content ?? []) ?? [];
  const audio = blocks.findLast((item) => item.type === "audio" && item.data);
  if (!audio?.data) throw new Error("Gemini TTS празен отговор.");
  const bytes = Buffer.from(audio.data, "base64");
  if (bytes.toString("ascii", 0, 4) !== "RIFF") throw new Error("Gemini TTS не върна WAV.");
  return bytes;
}
