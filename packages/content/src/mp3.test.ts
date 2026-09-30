import { describe, expect, it } from "vitest";
import { inspectMp3 } from "./mp3";

function frame(padding = 0): Buffer {
  const length = 417 + padding;
  const header = Buffer.alloc(length);
  // MPEG1 Layer III, 128 kbps, 44100 Hz.
  const bits = 0xffe00000 | (3 << 19) | (1 << 17) | (1 << 16) | (9 << 12) | (padding << 9);
  header.writeUInt32BE(bits >>> 0, 0);
  return header;
}

function id3(size: number): Buffer {
  const header = Buffer.alloc(10);
  header.write("ID3", 0, "ascii");
  header[6] = (size >> 21) & 0x7f;
  header[7] = (size >> 14) & 0x7f;
  header[8] = (size >> 7) & 0x7f;
  header[9] = size & 0x7f;
  return Buffer.concat([header, Buffer.alloc(size)]);
}

describe("mp3", () => {
  it("reads two frames, skips an ID3 tag, and rejects everything else", () => {
    expect(inspectMp3(Buffer.concat([frame(), frame()]))?.durationSec).toBe(1);
    expect(inspectMp3(Buffer.concat([id3(4), frame(), frame()]))?.durationSec).toBe(1);
    expect(inspectMp3(Buffer.concat([frame(1), frame()]))?.durationSec).toBe(1);
    expect(inspectMp3(frame())).toBeNull();
    expect(inspectMp3(Buffer.from("<html></html>"))).toBeNull();
    expect(inspectMp3(Buffer.alloc(80))).toBeNull();
    expect(inspectMp3(Buffer.alloc(10))).toBeNull();
  });
});
