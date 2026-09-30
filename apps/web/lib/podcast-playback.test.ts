import { describe, expect, it } from "vitest";
import { adjacentEpisode, playbackClock, seekRatio } from "./podcast-playback";

const episodes = [{ id: "a" }, { id: "b" }, { id: "c" }];

describe("podcast playback", () => {
  it("formats the clock with hours only after sixty minutes", () => {
    expect(playbackClock(0)).toBe("0:00");
    expect(playbackClock(65)).toBe("1:05");
    expect(playbackClock(3600)).toBe("1:00:00");
    expect(playbackClock(3723)).toBe("1:02:03");
    expect(playbackClock(Number.NaN)).toBe("0:00");
    expect(playbackClock(-4)).toBe("0:00");
  });

  it("moves inside the queue and does not wrap past the ends", () => {
    expect(adjacentEpisode(episodes, "b", 1)?.id).toBe("c");
    expect(adjacentEpisode(episodes, "b", -1)?.id).toBe("a");
    expect(adjacentEpisode(episodes, "a", -1)).toBeNull();
    expect(adjacentEpisode(episodes, "c", 1)).toBeNull();
    expect(adjacentEpisode(episodes, null, 1)?.id).toBe("a");
    expect(adjacentEpisode([], "a", 1)).toBeNull();
  });

  it("clamps a seek click to the bar", () => {
    expect(seekRatio(0, 200)).toBe(0);
    expect(seekRatio(50, 200)).toBe(0.25);
    expect(seekRatio(999, 200)).toBe(1);
    expect(seekRatio(-10, 200)).toBe(0);
    expect(seekRatio(10, 0)).toBe(0);
  });
});
