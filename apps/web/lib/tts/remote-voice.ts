import "server-only";

import { capSpeechText } from "./utterances";
import { newsSpeechTurns, packSpeechParts, speechByteChunks, unpackSpeechParts } from "./speech-parts";
import { checkSpeechEncoder, compressSpeechParts } from "@newspoint/content/audio";
import { checkSpeechCacheWritable, readCompressedSpeech, readSourceSpeech, speechCachePath, speechSourceCachePath, writeSpeechCache } from "./speech-cache";
import type { SpeechFormat } from "./speech-format";

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
const pendingSource = new Map<string, Promise<Uint8Array>>();

type GeminiAudio = {
  steps?: Array<{ type?: string; content?: Array<{ type?: string; data?: string }> }>;
  error?: { message?: string };
};

export async function bulgarianSpeech(cacheKey: string, text: string, format: SpeechFormat = "aac"): Promise<Uint8Array> {
  const script = capSpeechText(text);
  if (!script) return new Uint8Array();
  const jobKey = `${cacheKey}:${format}`;
  const current = pending.get(jobKey);
  if (current) return current;
  const job = loadOrSpeak(cacheKey, script, format).finally(() => {
    if (pending.get(jobKey) === job) pending.delete(jobKey);
  });
  pending.set(jobKey, job);
  return job;
}

async function loadOrSpeak(cacheKey: string, text: string, format: SpeechFormat): Promise<Uint8Array> {
  const cached = await readCompressedSpeech(cacheKey, format);
  if (cached) return cached;
  await checkSpeechCacheWritable();
  await checkSpeechEncoder(format);
  const existing = pendingSource.get(cacheKey);
  const job = existing ?? loadOrGenerateSource(cacheKey, text).finally(() => {
    if (pendingSource.get(cacheKey) === job) pendingSource.delete(cacheKey);
  });
  if (!existing) pendingSource.set(cacheKey, job);
  const source = await job;
  const audio = packSpeechParts(await compressSpeechParts(unpackSpeechParts(source), format));
  await writeSpeechCache(speechCachePath(cacheKey, format), audio);
  return audio;
}

async function loadOrGenerateSource(cacheKey: string, text: string): Promise<Uint8Array> {
  let source = await readSourceSpeech(cacheKey);
  if (!source) {
    source = packSpeechParts(await speakGemini(text));
  }
  // Save paid output or a legacy source before encoding so retries reuse it.
  await writeSpeechCache(speechSourceCachePath(cacheKey), source);
  return source;
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
