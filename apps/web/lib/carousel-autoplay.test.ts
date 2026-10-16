import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CAROUSEL_SPEED, LATEST_CAROUSEL_SPEED, startCarouselAutoplay } from "./carousel-autoplay";

class ElementStub extends EventTarget {
  scrollLeft = 0;
  offsetWidth = 1000;
  attributes = new Set<string>();
  hasAttribute(name: string) { return this.attributes.has(name); }
  matches(selector: string) { return selector === ":focus-visible"; }
  contains(node: unknown) { return node === this; }
}

let frames: Map<number, FrameRequestCallback>;
let nextFrame: number;
let windowStub: EventTarget;
let doc: EventTarget & { hidden: boolean; documentElement: ElementStub };
let desktop: EventTarget & { matches: boolean };
let intersection: (entries: { isIntersecting: boolean }[]) => void;
let resized: () => void;
let pagerChanged: () => void;
let disconnected: ReturnType<typeof vi.fn>;
let viewport: ElementStub;
let strip: ElementStub;
let container: ElementStub;
let controller: ReturnType<typeof startCarouselAutoplay> | undefined;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
  frames = new Map(); nextFrame = 0; disconnected = vi.fn();
  windowStub = new EventTarget();
  doc = Object.assign(new EventTarget(), { hidden: false, documentElement: new ElementStub() });
  desktop = Object.assign(new EventTarget(), { matches: false });
  vi.stubGlobal("document", doc);
  vi.stubGlobal("HTMLElement", ElementStub);
  vi.stubGlobal("Node", ElementStub);
  vi.stubGlobal("window", Object.assign(windowStub, {
    matchMedia: () => desktop,
    setTimeout, clearTimeout,
    requestAnimationFrame: (callback: FrameRequestCallback) => { frames.set(++nextFrame, callback); return nextFrame; },
    cancelAnimationFrame: (id: number) => frames.delete(id),
  }));
  vi.stubGlobal("IntersectionObserver", class {
    constructor(callback: typeof intersection) { intersection = callback; }
    observe() {} disconnect = disconnected;
  });
  vi.stubGlobal("ResizeObserver", class {
    constructor(callback: typeof resized) { resized = callback; }
    observe() {} disconnect = disconnected;
  });
  vi.stubGlobal("MutationObserver", class {
    constructor(callback: typeof pagerChanged) { pagerChanged = callback; }
    observe() {} disconnect = disconnected;
  });
  viewport = new ElementStub(); strip = new ElementStub(); container = new ElementStub();
});
afterEach(() => { controller?.destroy(); controller = undefined; vi.useRealTimers(); vi.unstubAllGlobals(); });

function start(speed = CAROUSEL_SPEED, motion: "to-left" | "to-right" = "to-left") {
  controller = startCarouselAutoplay({
    viewport: viewport as unknown as HTMLElement, strip: strip as unknown as HTMLElement,
    container: container as unknown as HTMLElement, speed, motion, mobileOnly: true,
  });
  return controller;
}
function frame(ms = 16) {
  vi.advanceTimersByTime(ms);
  const queued = [...frames.values()]; frames.clear();
  for (const callback of queued) callback(performance.now());
}
function visible(value = true) { intersection([{ isIntersecting: value }]); }
function pointer(target: EventTarget, type: string, pointerType = "touch") {
  const event = new Event(type, { cancelable: true });
  Object.defineProperty(event, "pointerType", { value: pointerType });
  return target.dispatchEvent(event);
}

describe("carousel autoplay ownership and scheduling", () => {
  it("schedules no frames offscreen and resumes without catching up elapsed time", () => {
    start(); expect(frames.size).toBe(0);
    visible(); frame(); frame(); expect(viewport.scrollLeft).toBeGreaterThan(0);
    visible(false); const before = viewport.scrollLeft;
    vi.advanceTimersByTime(5000); expect(frames.size).toBe(0); expect(viewport.scrollLeft).toBe(before);
    visible(); frame(); expect(viewport.scrollLeft).toBe(before);
    frame(); expect(viewport.scrollLeft - before).toBeCloseTo(0.288);
  });
  it("recognizes its own asynchronous scroll events without a second RAF", () => {
    start(); visible(); frame(); frame();
    viewport.dispatchEvent(new Event("scroll"));
    expect(frames.size).toBe(1); expect(vi.getTimerCount()).toBe(0);
  });
  it("waits for the full momentum tail without needing the newer scrollend event", () => {
    start(); visible(); frame(); frame();
    for (const left of [100, 200, 240]) {
      viewport.scrollLeft = left; viewport.dispatchEvent(new Event("scroll"));
      vi.advanceTimersByTime(600); expect(frames.size).toBe(0);
    }
    vi.advanceTimersByTime(301); frame(); expect(viewport.scrollLeft).toBe(240);
    frame(); expect(viewport.scrollLeft).toBeCloseTo(240.288);
  });
  it("never steals a held touch/pen and leaves native events uncancelled", () => {
    start(); visible(); frame(); frame();
    expect(pointer(viewport, "pointerdown")).toBe(true);
    vi.advanceTimersByTime(2500); expect(frames.size).toBe(0);
    pointer(windowStub, "pointerup"); vi.advanceTimersByTime(899); expect(frames.size).toBe(0);
    vi.advanceTimersByTime(1); expect(frames.size).toBe(1);
    expect(pointer(viewport, "pointerdown", "pen")).toBe(true); expect(frames.size).toBe(0);
    pointer(windowStub, "pointercancel", "pen");
    vi.advanceTimersByTime(901); expect(frames.size).toBe(1);
  });
  it("pauses for vertical page scrolling without intercepting it", () => {
    start(); visible(); frame(); frame();
    const event = new Event("scroll", { cancelable: true });
    Object.defineProperty(event, "target", { value: doc });
    expect(windowStub.dispatchEvent(event)).toBe(true); expect(frames.size).toBe(0);
    vi.advanceTimersByTime(199); expect(frames.size).toBe(0);
    vi.advanceTimersByTime(1); expect(frames.size).toBe(1);
  });
  it("sleeps completely in a background tab and during a rubric pager transition", () => {
    start(); visible(); frame(); frame();
    doc.hidden = true; doc.dispatchEvent(new Event("visibilitychange"));
    expect(frames.size).toBe(0); expect(vi.getTimerCount()).toBe(0);
    doc.hidden = false; doc.dispatchEvent(new Event("visibilitychange")); expect(frames.size).toBe(1);
    doc.documentElement.attributes.add("data-mobile-pager-visual"); pagerChanged(); expect(frames.size).toBe(0);
    doc.documentElement.attributes.clear(); pagerChanged(); expect(frames.size).toBe(1);
  });
  it("tracks layout breakpoint changes and the measured loop width", () => {
    start(); visible(); frame(); frame();
    desktop.matches = true; desktop.dispatchEvent(new Event("change")); expect(frames.size).toBe(0);
    desktop.matches = false; desktop.dispatchEvent(new Event("change")); expect(frames.size).toBe(1);
    strip.offsetWidth = 0; resized(); expect(frames.size).toBe(0);
    strip.offsetWidth = 800; resized(); expect(frames.size).toBe(1);
  });
  it("keeps independent hover/focus/drag pauses and does not restart until all release", () => {
    const api = start(); visible(); frame();
    pointer(container, "pointerenter", "mouse"); api.pause("drag");
    pointer(container, "pointerleave", "mouse"); expect(frames.size).toBe(0);
    api.resume("drag"); expect(frames.size).toBe(1);
    container.dispatchEvent(new Event("focusin")); expect(frames.size).toBe(0);
    container.dispatchEvent(new Event("focusout")); expect(frames.size).toBe(1);
  });
  it("uses 24px/s for latest versus 18px/s for focus, caps stalls and wraps both directions", () => {
    expect(LATEST_CAROUSEL_SPEED / CAROUSEL_SPEED).toBeCloseTo(4 / 3);
    start(LATEST_CAROUSEL_SPEED); visible(); frame();
    for (let i = 0; i < 60; i++) frame(1000 / 60);
    expect(viewport.scrollLeft).toBeCloseTo(24, 1);
    const before = viewport.scrollLeft; frame(5000);
    expect(viewport.scrollLeft - before).toBeCloseTo(1.536);
    controller!.destroy(); viewport.scrollLeft = 0;
    start(CAROUSEL_SPEED, "to-right"); visible(); frame(); frame();
    expect(viewport.scrollLeft).toBeCloseTo(999.712);
  });
  it("cancels timers, frames, observers and input listeners on teardown", () => {
    const api = start(); visible(); frame(); api.hold();
    api.destroy(); expect(frames.size).toBe(0); expect(vi.getTimerCount()).toBe(0);
    expect(disconnected).toHaveBeenCalledTimes(3);
    viewport.scrollLeft = 200; viewport.dispatchEvent(new Event("scroll"));
    doc.dispatchEvent(new Event("visibilitychange"));
    expect(frames.size).toBe(0); expect(vi.getTimerCount()).toBe(0);
  });
});
