import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { afterCriticalPageLoad, constrainedConnection, whenNearViewport } from "./deferred-page-work";

let win: EventTarget & { requestIdleCallback?: (work: () => void) => number; cancelIdleCallback: ReturnType<typeof vi.fn> };
let doc: EventTarget & { readyState: string; hidden: boolean };
beforeEach(() => {
  vi.useFakeTimers();
  win = Object.assign(new EventTarget(), { setTimeout, clearTimeout, cancelIdleCallback: vi.fn() });
  doc = Object.assign(new EventTarget(), { readyState: "loading", hidden: false });
  vi.stubGlobal("window", win); vi.stubGlobal("document", doc); vi.stubGlobal("navigator", {});
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("deferred page work", () => {
  it("keeps speculation behind critical window load and idle, and runs only once", () => {
    const work = vi.fn(); let idle: (() => void) | undefined;
    win.requestIdleCallback = callback => { idle = callback; return 3; };
    const cancel = afterCriticalPageLoad(work);
    vi.advanceTimersByTime(10000); expect(work).not.toHaveBeenCalled();
    win.dispatchEvent(new Event("load")); vi.advanceTimersByTime(1200);
    expect(work).not.toHaveBeenCalled(); idle!(); expect(work).toHaveBeenCalledOnce();
    win.dispatchEvent(new Event("load")); vi.advanceTimersByTime(10000); expect(work).toHaveBeenCalledOnce(); cancel();
  });
  it("cancels before load, before timeout and before idle", () => {
    const work = vi.fn(); const early = afterCriticalPageLoad(work); early();
    win.dispatchEvent(new Event("load")); vi.runAllTimers(); expect(work).not.toHaveBeenCalled();
    doc.readyState = "complete"; const timer = afterCriticalPageLoad(work); timer(); vi.runAllTimers();
    let idle: (() => void) | undefined; win.requestIdleCallback = cb => { idle = cb; return 9; };
    const later = afterCriticalPageLoad(work); vi.advanceTimersByTime(1200); later(); idle!();
    expect(work).not.toHaveBeenCalled(); expect(win.cancelIdleCallback).toHaveBeenCalledWith(9);
  });
  it("skips constrained speculation and resumes hidden-tab work when visible", () => {
    doc.readyState = "complete"; const work = vi.fn(); afterCriticalPageLoad(work);
    vi.stubGlobal("navigator", { connection: { effectiveType: "3g" } }); vi.runAllTimers();
    expect(work).not.toHaveBeenCalled(); vi.stubGlobal("navigator", {}); doc.hidden = true;
    afterCriticalPageLoad(work); vi.runAllTimers(); expect(work).not.toHaveBeenCalled();
    doc.hidden = false; doc.dispatchEvent(new Event("visibilitychange"));
    expect(work).toHaveBeenCalledOnce(); doc.dispatchEvent(new Event("visibilitychange"));
    expect(work).toHaveBeenCalledOnce();
  });
  it("classifies saveData, slow2g,2g,3g and limited measured downlink; unknown is allowed", () => {
    for (const c of [{ saveData: true }, { effectiveType: "slow-2g" }, { effectiveType: "2g" }, { effectiveType: "3g" }, { downlink: 1 }]) expect(constrainedConnection(c)).toBe(true);
    expect(constrainedConnection()).toBe(false); expect(constrainedConnection({ effectiveType: "4g", downlink: 8 })).toBe(false);
  });
  it("still starts essential post-load chrome on constrained connections", () => {
    doc.readyState = "complete"; vi.stubGlobal("navigator", { connection: { saveData: true } });
    const work = vi.fn(); afterCriticalPageLoad(work, 0, { skipConstrained: false });
    vi.runAllTimers(); expect(work).toHaveBeenCalledOnce();
  });
  it("keeps distant clone work asleep, prepares near viewport and disconnects on cleanup", () => {
    let intersection: (entries: { isIntersecting: boolean }[]) => void = () => {};
    const disconnect = vi.fn(), observe = vi.fn();
    class Observer { constructor(cb: typeof intersection, options: unknown) { intersection = cb; expect(options).toEqual({ rootMargin: "320px 0px" }); } disconnect = disconnect; observe = observe; }
    Object.assign(win, { IntersectionObserver: Observer }); vi.stubGlobal("IntersectionObserver", Observer);
    const work = vi.fn(), element = {} as Element; const cancel = whenNearViewport(element, work);
    expect(observe).toHaveBeenCalledWith(element); intersection([{ isIntersecting: false }]); expect(work).not.toHaveBeenCalled();
    intersection([{ isIntersecting: true }]); expect(work).toHaveBeenCalledOnce(); expect(disconnect).toHaveBeenCalledOnce();
    intersection([{ isIntersecting: true }]); expect(work).toHaveBeenCalledOnce();
    cancel(); expect(disconnect).toHaveBeenCalledTimes(2);
  });
});
