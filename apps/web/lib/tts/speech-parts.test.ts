import { describe, expect, it } from "vitest";
import { packSpeechParts, unpackSpeechParts } from "./speech-parts";

describe("speech parts", () => {
  it("round-trips several pieces", () => {
    const parts = [Uint8Array.from([1, 2, 3]), Uint8Array.from([9]), Uint8Array.from([4, 5])];
    const unpacked = unpackSpeechParts(packSpeechParts(parts));
    expect(unpacked.map((part) => [...part])).toEqual([[1, 2, 3], [9], [4, 5]]);
  });

  it("drops empty pieces", () => {
    expect(unpackSpeechParts(packSpeechParts([new Uint8Array(), Uint8Array.from([7])]))).toHaveLength(1);
  });
});
