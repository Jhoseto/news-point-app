import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { exportExpired, followPodcastVideo, podcastExportView, podcastVideoUrl, startPodcastVideoDownload, subscribeToPodcastExports } from "./podcast-tiktok-client";

const episodeId = "episode";
const jobId = "test-job";
function response(state: string, percent: number, id = jobId) {
  return Response.json({ jobId: id, state, percent });
}
function options() {
  return { episodeId, revision: 7, signal: new AbortController().signal, onStatus: vi.fn(), onReconnect: vi.fn() };
}

describe("Studio podcast video export", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

  it("starts once, recovers a lost status read and reports only server-confirmed progress", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response("preparing", 0))
      .mockResolvedValueOnce(response("rendering", 37))
      .mockRejectedValueOnce(new TypeError("offline"))
      .mockResolvedValueOnce(response("ready", 100));
    vi.stubGlobal("fetch", fetchMock);
    const callbacks = options();
    const result = followPodcastVideo(callbacks);
    await vi.runAllTimersAsync();
    await expect(result).resolves.toMatchObject({ jobId, state: "ready", percent: 100 });
    expect(callbacks.onStatus.mock.calls.map(([status]) => status.percent)).toEqual([0, 37, 100]);
    expect(callbacks.onReconnect).toHaveBeenCalledTimes(1);
    const [first, ...polls] = fetchMock.mock.calls;
    expect(first).toEqual([podcastVideoUrl(episodeId), expect.objectContaining({ method: "POST", body: '{"revision":7}' })]);
    expect(polls).toHaveLength(3);
    for (const [url, init] of polls) {
      expect(url).toBe("/admin/api/podcasts/episode/tiktok/?job=test-job");
      expect(init.method).toBeUndefined();
    }
    expect(podcastVideoUrl(episodeId, jobId, true)).toBe("/admin/api/podcasts/episode/tiktok/?job=test-job&download=1");
  });

  it("treats missing jobs as expired and enables a fresh export", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ error: { message: "Изтекъл файл." } }, { status: 404 })));
    const callbacks = options();
    const error = await followPodcastVideo({ ...callbacks, resumeJobId: jobId }).catch(reason => reason);
    expect(exportExpired(error)).toBe(true);
    expect(callbacks.onStatus).not.toHaveBeenCalled();
  });

  it.each([["ready", 73, jobId], ["rendering", 100, jobId], ["ready", 100, "other-job"]])(
    "rejects incomplete or mismatched responses (%s, %i, %s)", async (state, percent, id) => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(state as string, percent as number, id as string)));
      const callbacks = options();
      await expect(followPodcastVideo({ ...callbacks, resumeJobId: jobId })).rejects.toThrow("потвърждение");
      expect(callbacks.onStatus).not.toHaveBeenCalled();
    },
  );

  it("does not process a ready response after cancellation", async () => {
    const controller = new AbortController();
    vi.stubGlobal("fetch", vi.fn(async () => {
      controller.abort();
      return response("ready", 100);
    }));
    const callbacks = options();
    await expect(followPodcastVideo({ ...callbacks, signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
    expect(callbacks.onStatus).not.toHaveBeenCalled();
  });

  it("continues an explicitly started job away from the editor and downloads only once across remounts", async () => {
    const media = "episode:cover-a:audio-a";
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response("preparing", 0))
      .mockResolvedValueOnce(response("rendering", 42))
      .mockResolvedValueOnce(response("ready", 100));
    vi.stubGlobal("fetch", fetchMock);
    const link = { href: "", click: vi.fn(), remove: vi.fn() };
    vi.stubGlobal("document", { createElement: () => link, body: { append: vi.fn() } });
    const leaveEditor = subscribeToPodcastExports(vi.fn());
    expect(podcastExportView(media).busy).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    const started = startPodcastVideoDownload(media, episodeId, 7);
    leaveEditor();
    await vi.advanceTimersByTimeAsync(1500);
    const returnToEditor = subscribeToPodcastExports(vi.fn());
    expect(podcastExportView(media).job).toMatchObject({ state: "rendering", percent: 42 });
    await startPodcastVideoDownload(media, episodeId, 7);
    returnToEditor();
    await vi.advanceTimersByTimeAsync(1500);
    await started;
    expect(link.click).toHaveBeenCalledTimes(1);
    expect(link.href).toBe(podcastVideoUrl(episodeId, jobId, true));
    const unsubscribe = subscribeToPodcastExports(vi.fn());
    expect(podcastExportView(media)).toMatchObject({ job: { state: "ready", percent: 100 }, busy: false });
    expect(podcastExportView("episode:cover-a:replacement-audio").job).toBeNull();
    expect(fetchMock.mock.calls.filter(([, init]) => init.method === "POST")).toHaveLength(1);
    expect(link.click).toHaveBeenCalledTimes(1);
    unsubscribe();
    await vi.advanceTimersByTimeAsync(60 * 60_000);
    expect(podcastExportView(media).job).toBeNull();
  });
});
