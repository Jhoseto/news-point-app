import { afterEach, expect, it, vi } from "vitest";
import { Readable } from "node:stream";

vi.mock("server-only", () => ({}));
vi.mock("@newspoint/content/disk", () => ({ openRemoteRange: vi.fn(), remoteDiskFromEnv: vi.fn() }));
import { openRemoteRange } from "@newspoint/content/disk";
import { cachedPodcastAudio, podcastCacheKey, warmPodcastAudio } from "./podcast-audio-cache";
const disk = { target: "test@localhost", root: "/test", key: "unused", port: "22" };
afterEach(() => vi.restoreAllMocks());

it("deduplicates warming and exposes only a complete audio file", async () => {
  const source = new Readable({ read() {} });
  vi.mocked(openRemoteRange).mockReturnValue(source);
  const key = "podcasts/cache-complete.mp3";
  warmPodcastAudio(key, 4, disk);
  warmPodcastAudio(key, 4, disk);
  expect(cachedPodcastAudio(podcastCacheKey(key, disk))).toBeNull();
  await vi.waitFor(() => expect(openRemoteRange).toHaveBeenCalledTimes(1));
  source.push(Buffer.from("test")); source.push(null);
  await vi.waitFor(() => expect(cachedPodcastAudio(podcastCacheKey(key, disk))).toBeTruthy());
});

it("does not expose truncated downloads or accept oversized files", async () => {
  vi.mocked(openRemoteRange).mockReturnValue(Readable.from([Buffer.from("x")]));
  const key = "podcasts/cache-short.mp3";
  warmPodcastAudio(key, 5, disk);
  await vi.waitFor(() => expect(vi.mocked(openRemoteRange).mock.calls.some((call) => call[1] === key)).toBe(true));
  expect(cachedPodcastAudio(podcastCacheKey(key, disk))).toBeNull();
  warmPodcastAudio("podcasts/oversized.mp3", 90_000_001, disk);
  expect(cachedPodcastAudio(podcastCacheKey("podcasts/oversized.mp3", disk))).toBeNull();
});
