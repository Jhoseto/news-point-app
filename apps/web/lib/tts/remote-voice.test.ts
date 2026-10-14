import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { packSpeechParts, unpackSpeechParts } from "./speech-parts";
import { hasCachedSpeech, speechCacheDirectory, speechCachePath, speechSourceCachePath, writeSpeechCache } from "./speech-cache";
const codec = vi.hoisted(() => ({ check: vi.fn(), compress: vi.fn() }));
vi.mock("@newspoint/content/audio", () => ({ checkSpeechEncoder: codec.check, compressSpeechParts: codec.compress }));
import { bulgarianSpeech } from "./remote-voice";
const wav = Buffer.from("RIFFexisting-paid-source");
const encoded = Buffer.from("compressed-audio-fixture");
let directory: string;
let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "np-speech-test-"));
  vi.stubEnv("TTS_CACHE_DIR", directory);
  vi.stubEnv("GOOGLE_AI_STUDIO", "isolated-test-key");
  codec.check.mockReset().mockResolvedValue(undefined);
  codec.compress.mockReset().mockResolvedValue([encoded]);
  fetchMock = vi.fn(async () => Response.json({ steps: [{ type: "model_output", content: [{ type: "audio", data: wav.toString("base64") }] }] }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(async () => {
  vi.unstubAllEnvs(); vi.unstubAllGlobals();
  await rm(directory, { recursive: true, force: true });
});
it("converts a paid source once and reads compressed disk output after a module restart", async () => {
  await writeSpeechCache(speechSourceCachePath("existing-v2"), packSpeechParts([wav]));
  const audio = await bulgarianSpeech("existing-v2", "Реален тестов текст.");
  expect(unpackSpeechParts(audio).map(part => [...part])).toEqual([[...encoded]]);
  expect(await hasCachedSpeech("existing-v2")).toBe(true);
  vi.resetModules();
  const restarted = await import("./remote-voice");
  expect(new Uint8Array(await restarted.bulgarianSpeech("existing-v2", "Реален тестов текст."))).toEqual(audio);
  expect(codec.compress).toHaveBeenCalledTimes(1);
  expect(fetchMock).not.toHaveBeenCalled();
  expect(await readFile(speechSourceCachePath("existing-v2"))).toEqual(Buffer.from(packSpeechParts([wav])));
});
it("converts a source from the old checkout cache without calling the provider", async () => {
  const oldCheckout = path.join(directory, "old-web");
  const oldCache = path.join(oldCheckout, ".tts-cache");
  const { mkdir } = await import("node:fs/promises"); await mkdir(oldCache, { recursive: true });
  await writeFile(path.join(oldCache, "legacy-v1.glite4.parts"), packSpeechParts([wav]));
  const cwd = vi.spyOn(process, "cwd").mockReturnValue(oldCheckout);
  try {
    expect(await hasCachedSpeech("legacy-v1")).toBe(true);
    await bulgarianSpeech("legacy-v1", "Текст.");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(codec.compress).toHaveBeenCalledTimes(1);
    expect(await readFile(speechSourceCachePath("legacy-v1"))).toEqual(Buffer.from(packSpeechParts([wav])));
  } finally { cwd.mockRestore(); }
});
it("deduplicates concurrent requests and persists the paid source before conversion", async () => {
  await Promise.all([bulgarianSpeech("new-v1", "Текст."), bulgarianSpeech("new-v1", "Текст.")]);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(codec.compress).toHaveBeenCalledTimes(1);
  expect(unpackSpeechParts(await readFile(speechSourceCachePath("new-v1")))).toEqual([wav]);
  expect(unpackSpeechParts(await readFile(speechCachePath("new-v1")))).toEqual([encoded]);
});
it("uses a single paid source for simultaneous Opus and AAC requests", async () => {
  await Promise.all([bulgarianSpeech("both-v1", "Текст.", "opus"), bulgarianSpeech("both-v1", "Текст.", "aac")]);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(codec.compress).toHaveBeenCalledTimes(2);
  expect(await hasCachedSpeech("both-v1", "opus")).toBe(true);
  expect(await hasCachedSpeech("both-v1", "aac")).toBe(true);
});
it("retries a failed encoding from saved source without a second paid request", async () => {
  codec.compress.mockRejectedValueOnce(new Error("encoder failed"));
  await expect(bulgarianSpeech("retry-v1", "Текст.")).rejects.toThrow("encoder failed");
  await expect(bulgarianSpeech("retry-v1", "Текст.")).resolves.toEqual(packSpeechParts([encoded]));
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
it("fails before payment if the encoder is missing", async () => {
  codec.check.mockRejectedValueOnce(new Error("missing ffmpeg"));
  await expect(bulgarianSpeech("no-encoder-v1", "Текст.")).rejects.toThrow("missing ffmpeg");
  expect(fetchMock).not.toHaveBeenCalled();
});
it("refuses corrupt cache rather than generating again", async () => {
  await writeFile(speechCachePath("corrupt-v1"), new Uint8Array([1,2,3]));
  await expect(bulgarianSpeech("corrupt-v1", "Текст.")).rejects.toThrow("Invalid speech parts");
  expect(fetchMock).not.toHaveBeenCalled();
});
it("fails before payment if the cache location is not writable as a directory", async () => {
  const file = path.join(directory,"not-a-directory"); await writeFile(file,"fixture");
  vi.stubEnv("TTS_CACHE_DIR",file);
  await expect(bulgarianSpeech("blocked-v1", "Текст.")).rejects.toThrow();
  expect(fetchMock).not.toHaveBeenCalled();
});
it("uses a persistent private production default and rejects relative paths", () => {
  vi.stubEnv("TTS_CACHE_DIR", ""); vi.stubEnv("NODE_ENV", "production");
  expect(speechCacheDirectory()).toMatch(/\.cache[/\\]newspoint[/\\]tts$/);
  expect(speechCacheDirectory()).not.toContain("apps/web");
  vi.stubEnv("TTS_CACHE_DIR", "relative");
  expect(speechCacheDirectory).toThrow("absolute private directory");
});
