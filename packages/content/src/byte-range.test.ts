import { describe, expect, it } from "vitest";
import { parseByteRange, planPodcastAudio } from "./byte-range";

describe("byte range", () => {
  it("reads an open, closed and suffix range and rejects the rest", () => {
    expect(parseByteRange(null, 1000)).toBeNull();
    expect(parseByteRange("bytes=0-99", 1000)).toEqual({ start: 0, end: 99 });
    expect(parseByteRange("bytes=0-0", 1000)).toEqual({ start: 0, end: 0 });
    expect(parseByteRange("bytes=100-", 1000)).toEqual({ start: 100, end: 999 });
    expect(parseByteRange("bytes=-20", 1000)).toEqual({ start: 980, end: 999 });
    expect(parseByteRange("bytes=-5000", 1000)).toEqual({ start: 0, end: 999 });
    expect(parseByteRange("bytes=1000-1000", 1000)).toBe("invalid");
    expect(parseByteRange("bytes=0-1,2-3", 1000)).toBe("invalid");
    expect(parseByteRange("bytes=", 1000)).toBe("invalid");
    expect(parseByteRange("bytes=1.5-2", 1000)).toBe("invalid");
  });

  it("plans a full file, a slice, a rejected range and a missing file", () => {
    const full = planPodcastAudio(10, null, null);
    expect(full.status).toBe(200);
    if (full.status === 200) {
      expect(full.start).toBe(0);
      expect(full.end).toBe(9);
      expect(full.headers["content-length"]).toBe("10");
      expect(full.headers["content-range"]).toBeUndefined();
    }
    const slice = planPodcastAudio(10, "bytes=0-3", "glasat-ab12.mp3");
    expect(slice.status).toBe(206);
    if (slice.status === 206) {
      expect(slice.headers["content-range"]).toBe("bytes 0-3/10");
      expect(slice.headers["content-length"]).toBe("4");
      expect(slice.headers["content-disposition"]).toBe('attachment; filename="glasat-ab12.mp3"');
    }
    expect(planPodcastAudio(10, "bytes=10-10", null).status).toBe(416);
    expect(planPodcastAudio(0, null, null).status).toBe(404);
    const unsafe = planPodcastAudio(10, null, "../secret.mp3");
    if (unsafe.status === 200) expect(unsafe.headers["content-disposition"]).toBeUndefined();
  });
});
