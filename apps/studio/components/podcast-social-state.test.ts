import { describe, expect, it } from "vitest";
import type { SocialStatus } from "@newspoint/content";
import { podcastFacebookPostUrl, podcastShareControl, shouldPollPodcastShare, PODCAST_SOCIAL_POLL_WINDOW_MS } from "./podcast-social-state";

const ready: SocialStatus = { ready: true, connected: true, enabled: true, job: null };
const control = (status: SocialStatus | null, extra = {}) => podcastShareControl({ status, loading: false, submitting: false, pollingPaused: false, ...extra });
const job = (status: string, canRetry = false): SocialStatus => ({ ...ready, job: {
  id: "test-job", status, step: "photo", text: "Заглавие", message: "Състояние на изпращането", canRetry, url: null,
} });

describe("podcast Facebook action safety", () => {
  it("requires loaded connection status and a saved public episode before enabling a new share", () => {
    expect(control(ready).action).toBe("share");
    expect(control(null).action).toBe("check");
    for (const blockedReason of ["Първо публикувай епизода в сайта.", "Запиши промените, преди да споделиш епизода."]) {
      expect(control(ready, { blockedReason })).toMatchObject({ action: null, hint: blockedReason });
    }
    for (const flag of ["ready", "connected", "enabled"] as const) expect(control({ ...ready, [flag]: false }).action).toBe("check");
  });

  it("prevents duplicate sends during submission, queued work and after success", () => {
    expect(control(ready, { submitting: true }).action).toBeNull();
    for (const state of ["pending", "working", "sending", "retry", "succeeded", "cancelled"]) expect(control(job(state)).action).toBeNull();
    expect(control(job("succeeded"), { error: "Lost response" })).toMatchObject({ action: null, label: "Споделено във Facebook" });
  });

  it("uses GET-only recovery after ambiguous errors or a paused status check", () => {
    expect(control(ready, { error: "No confirmation" }).action).toBe("check");
    expect(control(job("uncertain", true)).action).toBe("check");
    const paused = control(job("sending"), { pollingPaused: true });
    expect(paused.action).toBe("check");
    expect(paused.busy).toBeFalsy();
    expect(control(job("failed", true)).action).toBe("retry");
    expect(control(job("failed", false)).action).toBe("check");
  });

  it("polls only active jobs and ends the waiting state after five minutes", () => {
    expect(shouldPollPodcastShare(ready, 0, 0)).toBe(false);
    expect(shouldPollPodcastShare(job("uncertain"), 0, 0)).toBe(false);
    expect(shouldPollPodcastShare(job("pending"), 0, PODCAST_SOCIAL_POLL_WINDOW_MS - 1)).toBe(true);
    expect(shouldPollPodcastShare(job("sending"), 0, PODCAST_SOCIAL_POLL_WINDOW_MS)).toBe(false);
    expect(shouldPollPodcastShare(job("succeeded"), 0, 100)).toBe(false);
  });

  it("only renders HTTPS Facebook post links", () => {
    expect(podcastFacebookPostUrl("https://www.facebook.com/123/posts/456")).toBe("https://www.facebook.com/123/posts/456");
    for (const url of ["javascript:alert(1)", "https://facebook.com.evil.test/123", "http://facebook.com/123", "https://secret@facebook.com/123"]) expect(podcastFacebookPostUrl(url)).toBeNull();
  });
});
