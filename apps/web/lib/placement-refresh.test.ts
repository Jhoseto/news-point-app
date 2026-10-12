import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPlacementRefresh } from "./placement-refresh";

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(1000); });
afterEach(() => vi.useRealTimers());

describe("placement refresh", () => {
  it("refreshes once at the boundary, independently of any news event", () => {
    const refresh = vi.fn();
    const scheduler = createPlacementRefresh(2500, refresh, () => false);
    vi.advanceTimersByTime(1499); expect(refresh).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1); expect(refresh).toHaveBeenCalledTimes(1);
    scheduler.check(); vi.advanceTimersByTime(60_000); expect(refresh).toHaveBeenCalledTimes(1);
  });
  it("waits for a suspended tab to become visible", () => {
    const refresh = vi.fn(); let hidden = true;
    const scheduler = createPlacementRefresh(2000, refresh, () => hidden);
    vi.advanceTimersByTime(5000); expect(refresh).not.toHaveBeenCalled();
    hidden = false; scheduler.check(); expect(refresh).toHaveBeenCalledTimes(1);
  });
  it("cancels navigation/unmount timers and handles an already-passed deadline", () => {
    const refresh = vi.fn();
    const scheduler = createPlacementRefresh(2000, refresh, () => false);
    scheduler.cancel(); vi.advanceTimersByTime(2000); scheduler.check(); expect(refresh).not.toHaveBeenCalled();
    createPlacementRefresh(2000, refresh, () => false); expect(refresh).toHaveBeenCalledTimes(1);
  });
  it("does not overflow the browser timer for a distant scheduled start", () => {
    const refresh = vi.fn();
    createPlacementRefresh(3_000_001_000, refresh, () => false);
    vi.advanceTimersByTime(2_147_483_647); expect(refresh).not.toHaveBeenCalled();
    vi.advanceTimersByTime(852_516_353); expect(refresh).toHaveBeenCalledTimes(1);
  });
});
