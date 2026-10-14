import { expect, it, vi } from "vitest";
import { parseSpeechFormat, preferredSpeechFormat } from "./speech-format";
import { loadDecodedSpeech } from "./speech-engine";
it("prefers Opus when supported and AAC otherwise, with bounded server negotiation", () => {
  expect(preferredSpeechFormat(() => "probably")).toBe("opus");
  expect(preferredSpeechFormat(() => "")).toBe("aac");
  expect(parseSpeechFormat([])).toBe("aac");
  expect(parseSpeechFormat(["opus"])).toBe("opus");
  for(const values of [["opus","aac"],["mp3"],[""]]) expect(parseSpeechFormat(values)).toBeNull();
});
function decodingContext(failures: number): AudioContext {
  const buffer = {numberOfChannels:1,sampleRate:24000,length:2,getChannelData:()=>new Float32Array(2)};
  const decode=vi.fn();
  for(let n=0;n<failures;n++) decode.mockRejectedValueOnce(new Error("unsupported codec"));
  decode.mockResolvedValue(buffer);
  return {decodeAudioData:decode,createBuffer:()=>buffer} as unknown as AudioContext;
}
it("falls back once to AAC only after actual Opus decoding fails", async () => {
  const load=vi.fn(async()=>[new Uint8Array([1,2])]);
  await loadDecodedSpeech(decodingContext(1),load,"opus");
  expect(load.mock.calls).toEqual([["opus"],["aac"]]);
});
it("does not make another request on a network/visibility failure", async () => {
  const load=vi.fn().mockRejectedValue(new Error("withdrawn"));
  await expect(loadDecodedSpeech(decodingContext(0),load,"opus")).rejects.toThrow("withdrawn");
  expect(load).toHaveBeenCalledTimes(1);
});
it("does not retry an unsupported fallback indefinitely", async () => {
  const load=vi.fn(async()=>[new Uint8Array([1,2])]);
  await expect(loadDecodedSpeech(decodingContext(2),load,"opus")).rejects.toThrow("unsupported codec");
  expect(load).toHaveBeenCalledTimes(2);
});
