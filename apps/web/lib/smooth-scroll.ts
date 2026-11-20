/**
 * Keeps the accepted makemepulse-like response, with a softer finite stop.
 * This is a measured fit and local tuning, not that site's private Lenis settings.
 * Native document scrolling keeps sticky layout, reading progress and history intact.
 */
export const WHEEL_MOTION = {
  durationMs: 1200,
  responseMs: 1500,
  tailStartMs: 600,
  exponent: 10,
  linePixels: 100 / 6,
  positionTolerance: 1,
} as const;

// Keep the first 93.85% of travel exactly as approved. Only the remaining
// exponential creep changes: this quintic joins with the same position,
// velocity and acceleration, then reaches rest with zero velocity/acceleration.
const tailExponential = 2 ** (-WHEEL_MOTION.exponent * WHEEL_MOTION.tailStartMs / WHEEL_MOTION.responseMs);
const tailRemaining = tailExponential - 0.001;
const tailDecay = Math.LN2 * WHEEL_MOTION.exponent *
  (WHEEL_MOTION.durationMs - WHEEL_MOTION.tailStartMs) / WHEEL_MOTION.responseMs;
const tailLinear = 3 - tailDecay * tailExponential / tailRemaining;
const tailQuadratic = (tailDecay ** 2 * tailExponential / tailRemaining + 6 * tailLinear - 6) / 2;

export function wheelEasing(elapsedMs: number): number {
  if (elapsedMs <= WHEEL_MOTION.tailStartMs) {
    return 1.001 - 2 ** (-WHEEL_MOTION.exponent * Math.max(0, elapsedMs) / WHEEL_MOTION.responseMs);
  }
  if (elapsedMs >= WHEEL_MOTION.durationMs) return 1;
  const progress = (elapsedMs - WHEEL_MOTION.tailStartMs) /
    (WHEEL_MOTION.durationMs - WHEEL_MOTION.tailStartMs);
  return 1 - tailRemaining * (1 - progress) ** 3 *
    (1 + tailLinear * progress + tailQuadratic * progress ** 2);
}

const NATIVE_REGION = [
  "input", "textarea", "select", "option", "canvas", "video", "audio", "iframe",
  "dialog", '[role="dialog"]', '[aria-modal="true"]',
  '[contenteditable]:not([contenteditable="false"])',
  "[data-np-native-scroll]", "[data-lenis-prevent]", "[data-lenis-prevent-wheel]",
].join(",");

const INTERRUPT_EVENTS = [
  "pointerdown", "touchstart", "keydown", "click", "focusin", "resize",
  "popstate", "hashchange", "pageshow", "pagehide", "blur",
] as const;

function isElement(node: EventTarget): node is Element {
  return "nodeType" in node && node.nodeType === 1;
}

/** Attach only for a desktop pointer. The caller also observes reader preferences. */
export function attachSmoothScroll(win: Window): () => void {
  const doc = win.document;
  const root = doc.documentElement;
  const reducedMotion = win.matchMedia("(prefers-reduced-motion: reduce)");
  let frame: number | null = null;
  let disposed = false;
  let from = win.scrollY;
  let current = from;
  let target = from;
  let lastWritten = from;
  let startedAt = 0;
  let sampledAt = 0;
  let activeUrl = win.location.href;

  const readLimit = () => Math.max(0, (doc.scrollingElement ?? root).scrollHeight - win.innerHeight);
  const clamp = (value: number, maximum: number) => Math.max(0, Math.min(maximum, value));
  const readLock = () => [root, doc.body].some((element) => {
    const style = win.getComputedStyle(element);
    return style.overflowY === "hidden" || style.overflowY === "clip";
  });
  let maximum = readLimit();
  let locked = readLock();
  const inlineLock = (element: HTMLElement) => {
    const overflow = element.style.overflowY || element.style.overflow;
    return overflow === "hidden" || overflow === "clip";
  };
  const unavailable = () => disposed || doc.hidden || reducedMotion.matches ||
    root.dataset.reducedMotion === "true" || inlineLock(root) || inlineLock(doc.body) || locked;

  const cancel = () => {
    if (frame !== null) win.cancelAnimationFrame(frame);
    frame = null;
    from = current = target = lastWritten = win.scrollY;
    sampledAt = win.performance.now();
  };

  // Keep layout/style reads out of the animation loop. ResizeObserver runs after
  // layout, including changes to content-visibility's estimated document height.
  const browser = win as Window & typeof globalThis;
  const sizes = typeof browser.ResizeObserver === "function" ? new browser.ResizeObserver(() => {
    if (!disposed) maximum = readLimit();
  }) : null;
  sizes?.observe(root);
  sizes?.observe(doc.body);
  const locks = typeof browser.MutationObserver === "function" ? new browser.MutationObserver(() => {
    if (disposed) return;
    locked = readLock();
    if (unavailable()) cancel();
  }) : null;
  locks?.observe(root, { attributes: true, attributeFilter: ["style", "class", "data-reduced-motion"] });
  locks?.observe(doc.body, { attributes: true, attributeFilter: ["style", "class"] });

  const hasExternalMovement = () => Math.abs(win.scrollY - lastWritten) > WHEEL_MOTION.positionTolerance;

  const nativeRegion = (event: WheelEvent) => {
    for (const node of event.composedPath()) {
      if (!isElement(node)) continue;
      // body can compute overflow-y:auto because of overflow-x:hidden; it is the page.
      if (node === root || node === doc.body) break;
      if (node.matches(NATIVE_REGION)) return true;
      const style = win.getComputedStyle(node);
      if (/^(auto|scroll|overlay)$/.test(style.overflowY) && node.scrollHeight > node.clientHeight) {
        // Leave nested scrollers native even at their edges (including scroll chaining).
        return true;
      }
    }
    return false;
  };

  const tick = (time: number) => {
    // Preserve the native fallback in environments without these browser APIs.
    if (!sizes) maximum = readLimit();
    if (!locks) locked = readLock();
    if (unavailable() || activeUrl !== win.location.href || hasExternalMovement()) {
      cancel();
      return;
    }
    const boundedTarget = clamp(target, maximum);
    if (boundedTarget !== target) {
      // Only an invalid destination needs rebasing. Growth or reflow below the
      // destination must not restart easing and produce a repeated slowdown.
      target = boundedTarget;
      from = current = win.scrollY;
      startedAt = time;
    }
    const eased = wheelEasing(time - startedAt);
    current = clamp(from + (target - from) * eased, maximum);
    sampledAt = time;
    if (current !== lastWritten) {
      win.scrollTo({ top: current, left: win.scrollX, behavior: "instant" });
      lastWritten = win.scrollY;
    }
    // The browser may reach an exact target before the subpixel tail expires.
    // Stop then; do not infer its pixel grid (zoom/high-DPI can be fractional).
    if (eased === 1 || from === target || lastWritten === target) {
      frame = null;
      from = current = target = lastWritten;
    } else {
      frame = win.requestAnimationFrame(tick);
    }
  };

  const onWheel = (event: WheelEvent) => {
    // A carousel or lightbox may have already claimed this wheel on a child node.
    if (event.defaultPrevented || !event.cancelable || event.ctrlKey || event.metaKey ||
      event.altKey || event.shiftKey || !Number.isFinite(event.deltaY) ||
      !Number.isFinite(event.deltaX) || !event.deltaY ||
      Math.abs(event.deltaX) >= Math.abs(event.deltaY)) {
      cancel();
      return;
    }
    // A new gesture refreshes the cache, including any overflow outside observed
    // element boxes. An active wheel burst uses the observer-maintained values.
    if (frame === null || !sizes) maximum = readLimit();
    if (frame === null || !locks) locked = readLock();
    if (unavailable() || nativeRegion(event)) {
      cancel();
      return;
    }
    if (frame === null || hasExternalMovement() || activeUrl !== win.location.href) cancel();
    const delta = event.deltaY * (event.deltaMode === 1 ? WHEEL_MOTION.linePixels : event.deltaMode === 2 ? win.innerHeight : 1);
    const nextTarget = clamp(target + delta, maximum);
    if (frame === null && nextTarget === win.scrollY) return;
    event.preventDefault();
    from = current;
    target = nextTarget;
    // `current` belongs to the last rendered frame. Retarget from that same
    // instant: wheel delivery can happen after the upcoming RAF's timestamp.
    // Using performance.now() here would reset progress to zero on that frame,
    // repeatedly stalling dense wheel/trackpad input until the gesture stops.
    startedAt = sampledAt;
    activeUrl = win.location.href;
    if (frame === null) frame = win.requestAnimationFrame(tick);
  };

  win.addEventListener("wheel", onWheel, { passive: false });
  for (const name of INTERRUPT_EVENTS) win.addEventListener(name, cancel, { capture: true, passive: true });
  doc.addEventListener("visibilitychange", cancel);
  reducedMotion.addEventListener("change", cancel);

  return () => {
    disposed = true;
    cancel();
    sizes?.disconnect();
    locks?.disconnect();
    win.removeEventListener("wheel", onWheel);
    for (const name of INTERRUPT_EVENTS) win.removeEventListener(name, cancel, { capture: true });
    doc.removeEventListener("visibilitychange", cancel);
    reducedMotion.removeEventListener("change", cancel);
  };
}
