import { runInNewContext } from "node:vm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PWA_LAUNCH_SCRIPT } from "./pwa-launch";

function launch({ standalone = true, ios = false, reduced = false } = {}) {
  vi.useFakeTimers();
  let elapsed = 0;
  const properties = new Map<string, string>();
  const root = { dataset: {} as Record<string, string>, style: {
    setProperty: (key: string, value: string) => properties.set(key, value),
    removeProperty: (key: string) => properties.delete(key),
  } };
  const events = new Map<string, () => void>();
  const addEventListener = (name: string, fn: () => void) => events.set(name, fn);
  const removeEventListener = (name: string) => events.delete(name);
  const motion = { matches: reduced, addEventListener, removeEventListener };
  const images: { onload: () => void; onerror: () => void; src: string }[] = [];
  class Image {
    onload = () => {};
    onerror = () => {};
    src = "";
    decode = () => Promise.resolve();
    constructor() { images.push(this); }
  }
  const window = { addEventListener, removeEventListener, innerWidth: 390, innerHeight: 844 } as {
    innerWidth: number;
    innerHeight: number;
    addEventListener: typeof addEventListener;
    removeEventListener: typeof removeEventListener;
    __npLaunch?: { ready: () => void };
  };
  const document = { documentElement: root, hidden: false, addEventListener, removeEventListener };
  const context = { window, document, navigator: { standalone: ios }, Image,
    performance: { now: () => elapsed }, setTimeout, clearTimeout,
    matchMedia: (query: string) => query.includes("reduced") ? motion : { matches: standalone } };
  const run = () => runInNewContext(PWA_LAUNCH_SCRIPT, context);
  run();
  return { root, properties, images, window, document, events, motion, run,
    async loaded() { images[0]!.onload(); await vi.advanceTimersByTimeAsync(0); },
    async advance(ms: number) { elapsed += ms; await vi.advanceTimersByTimeAsync(ms); } };
}

afterEach(() => vi.useRealTimers());

describe("PWA first-paint launch", () => {
  it.each([{ standalone: false }, { reduced: true }])("skips tabs/reduced motion without downloading artwork: %j", (options) => {
    const app = launch(options);
    expect(app.root.dataset.npLaunch).toBeUndefined();
    expect(app.images).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("covers content synchronously, before hydration, including Apple's standalone signal", () => {
    const app = launch({ standalone: false, ios: true });
    expect(app.root.dataset.npLaunch).toBe("play");
    expect(app.images).toHaveLength(1);
  });

  it("uses one three-second timeline even with delayed and duplicate hydration", async () => {
    const app = launch();
    await app.loaded();
    await app.advance(1900);
    app.window.__npLaunch!.ready();
    app.window.__npLaunch!.ready();
    await app.advance(699);
    expect(app.root.dataset.npLaunch).toBe("play");
    await app.advance(1);
    expect(app.root.dataset.npLaunch).toBe("leave");
    await app.advance(400);
    expect(app.root.dataset.npLaunch).toBeUndefined();
    app.window.__npLaunch!.ready();
    app.run();
    expect(app.images).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("waits for artwork and hydration before revealing", async () => {
    const app = launch();
    await app.advance(3100);
    app.window.__npLaunch!.ready();
    expect(app.root.dataset.npLaunch).toBe("play");
    await app.loaded();
    await app.advance(1);
    expect(app.root.dataset.npLaunch).toBe("leave");
    await app.advance(400);
    expect(app.root.dataset.npLaunch).toBeUndefined();
  });

  it("fails open without React and never replays when a late bundle arrives", async () => {
    const app = launch();
    await app.advance(6000);
    expect(app.root.dataset.npLaunch).toBeUndefined();
    await app.loaded();
    app.window.__npLaunch!.ready();
    await app.advance(3000);
    expect(app.root.dataset.npLaunch).toBeUndefined();
    expect(app.events.size).toBe(0);
  });

  it("does not keep a blank cover after an artwork error", () => {
    const app = launch();
    app.images[0]!.onerror();
    expect(app.root.dataset.npLaunch).toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("locks launch geometry until dismissal while the viewport settles", async () => {
    const app = launch();
    expect(app.properties.get('--np-launch-width')).toBe('390px');
    expect(app.properties.get('--np-launch-height')).toBe('844px');
    app.window.innerHeight = 780;
    await app.loaded();
    app.window.__npLaunch!.ready();
    await app.advance(2000);
    expect(app.properties.get('--np-launch-height')).toBe('844px');
    await app.advance(1000);
    expect(app.properties.size).toBe(0);
  });

  it.each(["pagehide", "visibilitychange", "change"])("ends permanently on %s", async (event) => {
    const app = launch();
    await app.loaded();
    app.window.__npLaunch!.ready();
    app.document.hidden = true;
    app.motion.matches = true;
    app.events.get(event)!();
    await app.advance(4000);
    expect(app.root.dataset.npLaunch).toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);
  });
});
