import { describe, expect, it } from "vitest";
import { attachSmoothScroll, wheelEasing } from "./smooth-scroll";

class Target extends EventTarget {
  readonly listeners = new Map<string, Set<EventListenerOrEventListenerObject>>();
  override addEventListener(type: string, listener: EventListenerOrEventListenerObject | null, options?: AddEventListenerOptions | boolean) {
    if (listener) {
      const group = this.listeners.get(type) ?? new Set();
      group.add(listener);
      this.listeners.set(type, group);
    }
    super.addEventListener(type, listener, options);
  }
  override removeEventListener(type: string, listener: EventListenerOrEventListenerObject | null, options?: EventListenerOptions | boolean) {
    if (listener) this.listeners.get(type)?.delete(listener);
    super.removeEventListener(type, listener, options);
  }
  get listenerCount() { return [...this.listeners.values()].reduce((sum, group) => sum + group.size, 0); }
}

/** A deterministic browser boundary: real events, integer scroll positions and a controlled RAF clock. */
class Region extends Target {
  nodeType = 1;
  dataset: Record<string, string> = {};
  style = { overflow: "", overflowY: "" };
  overflowY = "visible";
  clientHeight = 800;
  scrollHeightValue = 800;
  heightReads = 0;
  get scrollHeight() { this.heightReads += 1; return this.scrollHeightValue; }
  set scrollHeight(height: number) { this.scrollHeightValue = height; }
  native = false;
  // Browser selector matching itself is covered by the rendered integration check.
  matches() { return this.native; }
}

function browser(initialY = 0, fractionalPositions = false) {
  const root = new Region();
  const body = new Region();
  const leaf = new Region();
  root.scrollHeight = 4000;
  const media = Object.assign(new Target(), { matches: false });
  const doc = Object.assign(new Target(), { documentElement: root, body, scrollingElement: root, hidden: false });
  let clock = 0;
  let nextId = 0;
  const frames = new Map<number, FrameRequestCallback>();
  const writes: number[] = [];
  const reads = { styles: 0 };
  const resizeObservers: Observer[] = [];
  const mutationObservers: Observer[] = [];
  class Observer {
    disconnected = false;
    readonly observed = new Set<Region>();
    constructor(readonly callback: () => void) {}
    observe(target: Region) { this.observed.add(target); }
    disconnect() { this.disconnected = true; this.observed.clear(); }
    fire() { if (!this.disconnected) this.callback(); }
  }
  const win = Object.assign(new Target(), {
    document: doc, innerHeight: 800, scrollX: 0, scrollY: initialY,
    location: { href: "https://newspoint.test/category/plovdiv/" },
    performance: { now: () => clock },
    matchMedia: () => media,
    getComputedStyle: (element: Region) => { reads.styles += 1; return { overflowY: element.overflowY }; },
    ResizeObserver: class extends Observer { constructor(callback: () => void) { super(callback); resizeObservers.push(this); } },
    MutationObserver: class extends Observer { constructor(callback: () => void) { super(callback); mutationObservers.push(this); } },
    requestAnimationFrame: (callback: FrameRequestCallback) => { frames.set(++nextId, callback); return nextId; },
    cancelAnimationFrame: (id: number) => { frames.delete(id); },
    scrollTo: (options: ScrollToOptions) => {
      const position = Math.max(0, Math.min(root.scrollHeightValue - win.innerHeight, options.top ?? win.scrollY));
      win.scrollY = fractionalPositions ? position : Math.round(position);
      writes.push(win.scrollY);
    },
  });
  const stop = attachSmoothScroll(win as unknown as Window);
  const wheel = (deltaY: number, init: Partial<WheelEventInit> = {}, path: EventTarget[] = [leaf, body, root], consumed = false) => {
    const { cancelable = true, ...values } = init;
    const event = new Event("wheel", { cancelable });
    Object.assign(event, { deltaX: 0, deltaY, deltaMode: 0, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...values });
    Object.defineProperty(event, "composedPath", { value: () => [...path, doc, win] });
    if (consumed) event.preventDefault();
    win.dispatchEvent(event);
    return event;
  };
  const frameAt = (timestamp: number, wallClock = timestamp) => {
    // RAF timestamps describe frame start, and can precede a wheel handler's
    // performance.now() even when that handler runs before the RAF callback.
    clock = wallClock;
    const pending = [...frames.values()];
    frames.clear();
    for (const callback of pending) callback(timestamp);
  };
  const advance = (elapsed: number) => frameAt(clock + elapsed);
  const run = (duration: number, hz = 60) => {
    const end = clock + duration;
    while (clock < end - 0.001) advance(Math.min(1000 / hz, end - clock));
  };
  return {
    win, doc, root, body, leaf, media, frames, writes, reads, wheel, advance, frameAt, run, stop,
    eventAt: (timestamp: number) => { clock = timestamp; },
    resizeObservers, mutationObservers,
    resizeElements: () => resizeObservers.forEach((observer) => observer.fire()),
    mutateAttributes: () => mutationObservers.forEach((observer) => observer.fire()),
  };
}

describe("wheel landing curve", () => {
  it("preserves the approved response for the first 600ms and changes only its final 6.15%", () => {
    for (const elapsed of [0, 1000 / 60, 50, 100, 300, 500, 599, 600]) {
      expect(wheelEasing(elapsed)).toBeCloseTo(Math.min(1, 1.001 - 2 ** (-10 * elapsed / 1500)), 12);
    }
    expect(1 - wheelEasing(600)).toBeCloseTo(0.0615, 12);
  });

  it("joins the existing trajectory without a position, velocity or acceleration discontinuity", () => {
    const step = 0.1;
    const join = wheelEasing(600);
    const velocityBefore = (join - wheelEasing(600 - step)) / step;
    const velocityAfter = (wheelEasing(600 + step) - join) / step;
    const accelerationBefore = (join - 2 * wheelEasing(600 - step) + wheelEasing(600 - 2 * step)) / step ** 2;
    const accelerationAfter = (wheelEasing(600 + 2 * step) - 2 * wheelEasing(600 + step) + join) / step ** 2;
    expect(Math.abs(velocityAfter - velocityBefore)).toBeLessThan(2e-7);
    expect(Math.abs(accelerationAfter - accelerationBefore)).toBeLessThan(5e-9);
  });

  it("decelerates monotonically to rest without overshooting or clamping early", () => {
    let position = wheelEasing(600);
    let velocity = Number.POSITIVE_INFINITY;
    for (let elapsed = 601; elapsed <= 1200; elapsed += 1) {
      const next = wheelEasing(elapsed);
      const nextVelocity = next - position;
      expect(next).toBeGreaterThanOrEqual(position - 1e-12);
      expect(next).toBeLessThanOrEqual(1);
      expect(nextVelocity).toBeLessThanOrEqual(velocity + 1e-12);
      position = next;
      velocity = nextVelocity;
    }
    expect(wheelEasing(1199)).toBeLessThan(1);
    expect(wheelEasing(1200)).toBe(1);
    expect(wheelEasing(1800)).toBe(1);
    const finalVelocity = wheelEasing(1200) - wheelEasing(1199);
    const finalAcceleration = wheelEasing(1200) - 2 * wheelEasing(1199) + wheelEasing(1198);
    expect(finalVelocity).toBeLessThan(1e-8);
    expect(Math.abs(finalAcceleration)).toBeLessThan(1e-8);
  });
});

describe("desktop wheel inertia", () => {
  it.each([[1, 60], [-1, 60], [1, 120], [-1, 120]])("avoids a late final-pixel crawl in the integer-scroll model (direction %i, %i Hz)", (direction, hz) => {
    const b = browser(500);
    b.wheel(direction * 120);
    const changes: Array<{ time: number; position: number }> = [];
    let previous = b.win.scrollY;
    for (let frame = 1; frame <= 1200 * hz / 1000; frame += 1) {
      const time = frame * 1000 / hz;
      b.frameAt(time);
      if (b.win.scrollY !== previous) changes.push({ time, position: b.win.scrollY });
      previous = b.win.scrollY;
    }
    const last = changes.at(-1)!;
    const penultimate = changes.at(-2)!;
    expect(last.position).toBe(500 + direction * 120);
    expect(Math.abs(last.position - penultimate.position)).toBe(1);
    expect(last.time - penultimate.time).toBeLessThanOrEqual(125);
    expect(b.frames.size).toBe(0);
    b.stop();
  });

  it.each([60, 120])("keeps moving at %i Hz when wheel wall clocks are newer than RAF timestamps", (hz) => {
    const b = browser(0, true);
    const positions: number[] = [];
    for (let frame = 1; frame <= hz; frame += 1) {
      const timestamp = frame * 1000 / hz;
      b.eventAt(timestamp + 1);
      b.wheel(4);
      b.frameAt(timestamp, timestamp + 1);
      positions.push(b.win.scrollY);
    }
    // Continuous input must already be moving, not queue almost all its travel
    // until the user stops touching the wheel/trackpad.
    const destination = hz * 4;
    expect(b.win.scrollY).toBeGreaterThan(destination * 0.65);
    expect(b.win.scrollY).toBeLessThan(destination);
    expect(positions.at(-1)! - positions.at(-2)!).toBeGreaterThan(3);
    b.run(1600);
    expect(b.win.scrollY).toBe(destination);
    b.stop();
  });

  it("starts a fresh smooth impulse after idle without applying the old frame's elapsed time", () => {
    const b = browser(0, true);
    b.wheel(120);
    b.run(1600);
    expect(b.frames.size).toBe(0);
    b.eventAt(10000);
    b.wheel(120);
    expect(b.win.scrollY).toBe(120);
    b.frameAt(10000 + 1000 / 60);
    expect(b.win.scrollY).toBeGreaterThan(125);
    expect(b.win.scrollY).toBeLessThan(135);
    b.run(1600);
    expect(b.win.scrollY).toBe(240);
    expect(b.frames.size).toBe(0);
    b.stop();
  });

  it("restarts smoothly from the native position after cancelling and moving the scrollbar", () => {
    const b = browser(0, true);
    b.wheel(600);
    b.run(100);
    b.win.dispatchEvent(new Event("pointerdown"));
    b.win.scrollY = 1800;
    b.eventAt(5000);
    b.wheel(120);
    expect(b.win.scrollY).toBe(1800);
    b.frameAt(4999, 5000);
    b.frameAt(5000 + 1000 / 60);
    expect(b.win.scrollY).toBeGreaterThan(1800);
    expect(b.win.scrollY).toBeLessThan(1820);
    b.run(1600);
    expect(b.win.scrollY).toBe(1920);
    expect(b.frames.size).toBe(0);
    b.stop();
  });

  it("does not insert a one-frame stop when another wheel impulse lands just before RAF", () => {
    const b = browser(0, true);
    b.wheel(120);
    b.frameAt(1000 / 60);
    const before = b.win.scrollY;
    b.eventAt(1000 / 30 + 1);
    b.wheel(120);
    b.frameAt(1000 / 30, 1000 / 30 + 1);
    // The new impulse should advance from the last sampled position over the
    // elapsed frame, rather than getting zero elapsed time from the newer event.
    expect(b.win.scrollY - before).toBeGreaterThan(15);
    b.run(1600);
    expect(b.win.scrollY).toBe(240);
    b.stop();
  });

  it("stops once the browser has actually reached the destination, without quantizing fractional positions", () => {
    const b = browser();
    b.wheel(120);
    b.run(1200);
    expect(b.win.scrollY).toBe(120);
    expect(b.frames.size).toBe(0);
    const writes = b.writes.length;
    b.run(500);
    expect(b.writes).toHaveLength(writes);
    b.stop();

    const fractional = browser(0, true);
    fractional.wheel(120);
    fractional.run(1000);
    expect(fractional.win.scrollY).toBeLessThan(120);
    expect(fractional.frames.size).toBe(1);
    fractional.run(200);
    expect(fractional.win.scrollY).toBe(120);
    expect(fractional.frames.size).toBe(0);
    fractional.stop();
  });

  it("uses the measured fast response and long, soft decay, then stops scheduling work", () => {
    const b = browser();
    expect(b.frames.size).toBe(0);
    expect(b.wheel(120).defaultPrevented).toBe(true);
    b.advance(1000 / 60);
    expect(b.win.scrollY).toBe(9);
    b.run(500 - 1000 / 60);
    expect(b.win.scrollY).toBe(108);
    b.run(1000);
    expect(b.win.scrollY).toBe(120);
    expect(b.frames.size).toBe(0);
    b.stop();
  });

  it("has the same trajectory at 60 and 120 Hz", () => {
    const sixty = browser();
    const fast = browser();
    sixty.wheel(600);
    fast.wheel(600);
    for (const duration of [100, 200, 200, 500, 500]) {
      sixty.run(duration, 60);
      fast.run(duration, 120);
      expect(fast.win.scrollY).toBe(sixty.win.scrollY);
    }
    expect(fast.frames.size).toBe(0);
    sixty.stop(); fast.stop();
  });

  it("accumulates repeated impulses without losing distance and can reverse to the top", () => {
    const b = browser();
    b.wheel(120);
    b.run(100);
    b.wheel(120);
    b.run(1500);
    expect(b.win.scrollY).toBe(240);
    b.wheel(120);
    b.run(100);
    const before = b.win.scrollY;
    b.wheel(-480);
    b.advance(1000 / 60);
    expect(b.win.scrollY).toBeLessThan(before);
    b.run(1500);
    expect(b.win.scrollY).toBe(0);
    b.stop();
  });

  it.each([[1, 3, 50], [2, 1, 800]])("normalizes delta mode %i without magnifying pixel input", (deltaMode, deltaY, expected) => {
    const b = browser();
    b.wheel(deltaY, { deltaMode });
    b.run(1500);
    expect(b.win.scrollY).toBe(expected);
    b.stop();
  });

  it("clamps both ends and leaves an idle edge wheel native", () => {
    const b = browser(3100);
    b.wheel(1000);
    b.run(1500);
    expect(b.win.scrollY).toBe(3200);
    expect(b.wheel(120).defaultPrevented).toBe(false);
    expect(b.frames.size).toBe(0);
    b.wheel(-9000);
    b.run(1500);
    expect(b.win.scrollY).toBe(0);
    expect(Math.min(...b.writes)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...b.writes)).toBeLessThanOrEqual(3200);
    b.stop();
  });

  it.each([
    { ctrlKey: true }, { metaKey: true }, { altKey: true }, { shiftKey: true },
    { deltaX: 150 }, { deltaY: 0 }, { deltaY: Number.NaN }, { deltaX: Number.POSITIVE_INFINITY },
    { cancelable: false },
  ])("leaves browser gestures and unsupported wheel input native (%j)", (init) => {
    const b = browser();
    b.wheel(120);
    expect(b.wheel(120, init).defaultPrevented).toBe(false);
    expect(b.frames.size).toBe(0);
    b.stop();
  });

  it("yields to a child wheel handler and cancels the old page impulse", () => {
    const b = browser();
    b.wheel(120);
    b.wheel(120, {}, undefined, true);
    expect(b.frames.size).toBe(0);
    b.run(1600);
    expect(b.writes).toHaveLength(0);
    b.stop();
  });

  it("leaves controls, dialogs, canvas and explicit native regions alone", () => {
    const b = browser();
    const control = new Region();
    control.native = true;
    b.wheel(120);
    expect(b.wheel(120, {}, [b.leaf, control, b.body, b.root]).defaultPrevented).toBe(false);
    expect(b.frames.size).toBe(0);
    b.stop();
  });

  it("preserves nested vertical scrollers, including their native edge behavior", () => {
    const b = browser();
    const scroller = new Region();
    scroller.overflowY = "auto";
    scroller.scrollHeight = 1200;
    for (const delta of [120, -120]) {
      expect(b.wheel(delta, {}, [b.leaf, scroller, b.body, b.root]).defaultPrevented).toBe(false);
    }
    expect(b.frames.size).toBe(0);
    // body overflow-y:auto must not accidentally disable the document controller.
    b.body.overflowY = "auto";
    b.body.scrollHeight = 4000;
    expect(b.wheel(120).defaultPrevented).toBe(true);
    b.stop();
  });

  it.each(["root", "body"] as const)("does not move a background locked through %s", (name) => {
    const b = browser();
    b.wheel(120);
    b.run(100);
    const position = b.win.scrollY;
    b[name].overflowY = "hidden";
    b.mutateAttributes();
    expect(b.frames.size).toBe(0);
    expect(b.win.scrollY).toBe(position);
    expect(b.wheel(120).defaultPrevented).toBe(false);
    b.stop();
  });

  it.each(["keydown", "pointerdown", "touchstart", "click", "focusin", "resize", "popstate", "hashchange", "pageshow", "pagehide", "blur"])("stops immediately for native %s interaction", (type) => {
    const b = browser();
    b.wheel(120);
    b.run(100);
    const position = b.win.scrollY;
    b.win.dispatchEvent(new Event(type));
    expect(b.frames.size).toBe(0);
    b.run(1600);
    expect(b.win.scrollY).toBe(position);
    b.stop();
  });

  it("never overwrites an anchor, browser restoration or external position change", () => {
    const b = browser();
    b.wheel(600);
    b.run(100);
    b.win.scrollY = 1800;
    b.advance(20);
    expect(b.win.scrollY).toBe(1800);
    expect(b.frames.size).toBe(0);
    b.wheel(120);
    b.run(1500);
    expect(b.win.scrollY).toBe(1920);
    b.stop();
  });

  it("cancels on route/query changes even when the document position did not change", () => {
    const b = browser();
    b.wheel(600);
    b.run(100);
    const position = b.win.scrollY;
    b.win.location.href += "?page=2";
    b.advance(20);
    expect(b.win.scrollY).toBe(position);
    expect(b.frames.size).toBe(0);
    b.stop();
  });

  it("reconciles a shrinking document without overshooting the new end", () => {
    const b = browser();
    b.wheel(2000);
    b.run(100);
    b.root.scrollHeight = 1800;
    b.resizeElements();
    b.run(1600);
    expect(b.win.scrollY).toBe(1000);
    expect(b.frames.size).toBe(0);
    b.stop();
  });

  it("stops for reduced motion from either the operating system or reader setting", () => {
    const b = browser();
    b.wheel(120);
    b.media.matches = true;
    b.media.dispatchEvent(new Event("change"));
    expect(b.frames.size).toBe(0);
    expect(b.wheel(120).defaultPrevented).toBe(false);
    b.media.matches = false;
    b.wheel(120);
    b.root.dataset.reducedMotion = "true";
    b.advance(20);
    expect(b.frames.size).toBe(0);
    expect(b.wheel(120).defaultPrevented).toBe(false);
    b.stop();
  });

  it("does not animate a hidden tab or retain listeners/RAF after detach", () => {
    const b = browser();
    b.wheel(120);
    b.doc.hidden = true;
    b.doc.dispatchEvent(new Event("visibilitychange"));
    expect(b.frames.size).toBe(0);
    expect(b.wheel(120).defaultPrevented).toBe(false);
    b.doc.hidden = false;
    b.wheel(120);
    b.stop();
    expect(b.frames.size).toBe(0);
    expect(b.win.listenerCount + b.doc.listenerCount + b.media.listenerCount).toBe(0);
    expect([...b.resizeObservers, ...b.mutationObservers].every((observer) => observer.disconnected)).toBe(true);
    expect(b.wheel(120).defaultPrevented).toBe(false);
    b.run(1600);
    expect(b.writes).toHaveLength(0);
  });

  it("keeps geometry and computed-style reads out of animation frames", () => {
    const b = browser();
    b.wheel(120);
    const styles = b.reads.styles;
    const heights = b.root.heightReads;
    b.run(1500);
    expect(b.reads.styles).toBe(styles);
    expect(b.root.heightReads).toBe(heights);
    b.stop();
  });

  it("does not restart easing when content-visibility or lazy content changes height below the target", () => {
    const stable = browser();
    const resizing = browser();
    stable.wheel(600);
    resizing.wheel(600);
    for (const height of [5000, 4500, 6000, 4000, 5000]) {
      resizing.root.scrollHeight = height;
      resizing.resizeElements();
      stable.run(300);
      resizing.run(300);
      expect(resizing.win.scrollY).toBe(stable.win.scrollY);
    }
    expect(resizing.frames.size).toBe(0);
    stable.stop(); resizing.stop();
  });

  it("honors an inline modal lock before its mutation observer callback", () => {
    const b = browser();
    b.wheel(120);
    b.run(100);
    const position = b.win.scrollY;
    b.body.style.overflow = "hidden";
    b.advance(20);
    expect(b.win.scrollY).toBe(position);
    expect(b.frames.size).toBe(0);
    b.stop();
  });

  it("preserves fractional positions and the exact destination on high-density displays", () => {
    const b = browser(0, true);
    b.wheel(120.25);
    b.run(1000);
    expect(Number.isInteger(b.win.scrollY)).toBe(false);
    const lastPosition = b.win.scrollY;
    b.advance(1000 / 120);
    expect(b.win.scrollY).toBeGreaterThan(lastPosition);
    b.run(200);
    expect(b.win.scrollY).toBe(120.25);
    expect(b.frames.size).toBe(0);
    b.stop();
  });
});
