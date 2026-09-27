import { afterEach, describe, expect, it, vi } from "vitest";
import { createLiveRefreshScheduler } from "./refresh";

describe("live refresh while browsing an archive", () => {
  afterEach(() => vi.useRealTimers());

  it("keeps the archive stable and checks again after a queued navigation", () => {
    vi.useFakeTimers();
    let archive = false;
    const refresh = vi.fn();
    const scheduler = createLiveRefreshScheduler(refresh, () => archive, 700);
    scheduler.schedule();
    vi.advanceTimersByTime(700);
    expect(refresh).toHaveBeenCalledTimes(1);
    archive = true;
    scheduler.schedule();
    vi.advanceTimersByTime(700);
    expect(refresh).toHaveBeenCalledTimes(1);
    archive = false;
    scheduler.schedule();
    archive = true;
    vi.advanceTimersByTime(700);
    expect(refresh).toHaveBeenCalledTimes(1);
    scheduler.cancel();
  });

  it("coalesces bursts and cancels on cleanup", () => {
    vi.useFakeTimers();
    const refresh = vi.fn();
    const scheduler = createLiveRefreshScheduler(refresh, () => false, 700);
    scheduler.schedule();
    vi.advanceTimersByTime(500);
    scheduler.schedule();
    vi.advanceTimersByTime(500);
    expect(refresh).not.toHaveBeenCalled();
    vi.advanceTimersByTime(200);
    expect(refresh).toHaveBeenCalledTimes(1);
    scheduler.schedule();
    scheduler.cancel();
    vi.advanceTimersByTime(700);
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
