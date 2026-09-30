import { describe, expect, it } from "vitest";
import { adjacentEpisode, clampPlaybackTime, displayedEpisode, playbackClock, podcastPanelPlace, seekRatio } from "./podcast-playback";

const episodes = [{ id: "a" }, { id: "b" }, { id: "c" }];

describe("podcast playback", () => {
  it("suggests an episode without replacing an existing listening session", () => {
    expect(displayedEpisode(null, episodes[1])).toBe(episodes[1]);
    expect(displayedEpisode(episodes[0], episodes[1])).toBe(episodes[0]);
    expect(displayedEpisode(null, null)).toBeNull();
  });

  it("clamps seeking and stored positions to the actual audio duration", () => {
    expect(clampPlaybackTime(500, 120)).toBe(120);
    expect(clampPlaybackTime(-15, 120)).toBe(0);
    expect(clampPlaybackTime(30, 120)).toBe(30);
    expect(clampPlaybackTime(30, Number.NaN)).toBe(0);
    expect(clampPlaybackTime(Number.POSITIVE_INFINITY, 120)).toBe(0);
  });

  it("keeps the podcast panel inside the viewport while pointing at its opener", () => {
    for (const viewport of [360, 390, 768, 1280, 1440]) {
      for (const buttonLeft of [12, viewport / 2, viewport - 112]) {
        const place = podcastPanelPlace(viewport, buttonLeft, 100);
        expect(place.left).toBeGreaterThanOrEqual(12);
        expect(place.left + place.width).toBeLessThanOrEqual(viewport - 12);
        expect(place.width).toBeLessThanOrEqual(880);
        expect(place.left + place.arrow).toBeCloseTo(buttonLeft + 50);
      }
    }
  });
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
