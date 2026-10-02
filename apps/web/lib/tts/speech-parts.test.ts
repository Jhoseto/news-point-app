import { describe, expect, it } from "vitest";
import { newsSpeechTurns, packSpeechParts, speechByteChunks, unpackSpeechParts } from "./speech-parts";

describe("speech parts", () => {
  it("round-trips several pieces", () => {
    const parts = [Uint8Array.from([1, 2, 3]), Uint8Array.from([9]), Uint8Array.from([4, 5])];
    const unpacked = unpackSpeechParts(packSpeechParts(parts));
    expect(unpacked.map((part) => [...part])).toEqual([[1, 2, 3], [9], [4, 5]]);
  });

  it("drops empty pieces", () => {
    expect(unpackSpeechParts(packSpeechParts([new Uint8Array(), Uint8Array.from([7])]))).toHaveLength(1);
  });

  it("splits a news script into sentences and keeps abbreviations attached", () => {
    expect(newsSpeechTurns("Първо изречение. Второ изречение! Трето?")).toEqual([
      "Първо изречение.",
      "Второ изречение!",
      "Трето?",
    ]);
    expect(newsSpeechTurns("Виж т.нар. промяна в града.")).toEqual(["Виж т.нар. промяна в града."]);
  });

  it("keeps each speech piece under the Google byte limit", () => {
    const chunks = speechByteChunks(`${"български текст ".repeat(800)}`, 200);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) expect(Buffer.byteLength(chunk, "utf8")).toBeLessThanOrEqual(200);
  });
});
