/** CSS layout coordinates are unzoomed; client pointers/DOMRects are viewport pixels. */
export type DesktopViewport = { active: boolean; scale: number; width: number; height: number };
export const DESKTOP_VIEWPORT_CHANGE = "np:desktop-viewport";
const STATE_KEY = "__npDesktopViewport";
type Runtime = { model: DesktopViewport; measureZoom: boolean; locks: number; gutter: number; update: () => void };
type DesktopWindow = Window & { __npDesktopViewport?: Runtime };

export function desktopViewportModel(input: {
  width: number; availableWidth: number; height: number; desktop: boolean; browser: boolean; screen: boolean; zoomSupported: boolean;
}): DesktopViewport {
  const active = input.desktop && input.browser && input.screen && input.zoomSupported && input.width < 1920
    && input.availableWidth > 0 && input.height > 0;
  const scale = active ? Math.min(1, input.availableWidth / 1920) : 1;
  return { active, scale, width: active ? 1920 : input.width, height: input.height / scale };
}

export function getDesktopViewport(): DesktopViewport {
  if (typeof window === "undefined") return { active: false, scale: 1, width: 1920, height: 1080 };
  const runtime = (window as DesktopWindow)[STATE_KEY];
  const model = runtime?.model;
  if (!model) return { active: false, scale: 1, width: window.innerWidth, height: window.innerHeight };
  if (!model.active && !runtime?.measureZoom) return model;
  // On resize the requested zoom can precede layout by a frame. DOMRects and
  // pointer deltas must use the zoom of the measured layout, not the pending one.
  const root = document.documentElement;
  const scale = root.getBoundingClientRect().width / root.offsetWidth;
  return scale > 0 ? { ...model, scale, height: window.innerHeight / scale } : model;
}

/** Only use for viewport distances, never offsetWidth/clientWidth/ResizeObserver contentRect. */
export function desktopDistance(value: number, model = getDesktopViewport()): number { return value / model.scale; }
export function desktopPoint(point: { x: number; y: number }, model = getDesktopViewport()) {
  return { x: point.x / model.scale, y: point.y / model.scale };
}
export function desktopRect(rect: Pick<DOMRectReadOnly, "left" | "top" | "right" | "bottom" | "width" | "height">, model = getDesktopViewport()) {
  return { left: rect.left / model.scale, top: rect.top / model.scale, right: rect.right / model.scale,
    bottom: rect.bottom / model.scale, width: rect.width / model.scale, height: rect.height / model.scale };
}

/** Freeze the scrollbar width, including nested dialogs, until the owning lock is released. */
export function lockDesktopViewport(): () => void {
  const runtime = (window as DesktopWindow)[STATE_KEY];
  if (!runtime) return () => {};
  runtime.locks += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    runtime.locks -= 1;
    if (!runtime.locks) runtime.update();
  };
}

// Serialised with its pure model dependency so bootstrap and hydrated components share one model.
function bootstrapDesktopViewport(modelFor: typeof desktopViewportModel, stateKey: typeof STATE_KEY, eventName: string) {
  const host = window as DesktopWindow;
  if (host[stateKey]) return;
  const root = document.documentElement;
  const previousZoom = root.style.zoom;
  const desktop = matchMedia("(min-width: 64rem)");
  const browser = matchMedia("(display-mode: browser)");
  const screen = matchMedia("screen");
  const zoomSupported = CSS.supports("zoom", "0.5");
  let printing = false;
  let changeFrame = 0;
  const runtime: Runtime = { model: { active: false, scale: 1, width: innerWidth, height: innerHeight }, measureZoom: false, locks: 0, gutter: 0, update };
  host[stateKey] = runtime;
  function update() {
    // Root clientWidth is a viewport measurement even when html is zoomed.
    if (!runtime.locks) runtime.gutter = Math.max(0, innerWidth - root.clientWidth);
    const next = modelFor({ width: innerWidth, availableWidth: innerWidth - runtime.gutter, height: innerHeight,
      desktop: desktop.matches, browser: browser.matches, screen: screen.matches && !printing && !document.fullscreenElement, zoomSupported });
    const changed = Object.keys(next).some(key => next[key as keyof DesktopViewport] !== runtime.model[key as keyof DesktopViewport]);
    if (!changed) return;
    runtime.measureZoom = runtime.model.active || next.active;
    runtime.model = next;
    if (next.active) {
      root.setAttribute("data-np-desktop-scaled", "");
      // The bootstrap owns zoom and restores the previous inline value on exit.
      root.style.zoom = String(next.scale);
      root.style.setProperty("--np-desktop-scale", String(next.scale));
      root.style.setProperty("--np-desktop-height", `${next.height}px`);
      root.style.setProperty("--np-desktop-vw", "19.2px");
      root.style.setProperty("--np-desktop-vh", "10.8px");
    } else {
      root.removeAttribute("data-np-desktop-scaled");
      root.style.zoom = previousZoom;
      for (const key of ["scale", "height", "vw", "vh"]) root.style.removeProperty(`--np-desktop-${key}`);
    }
    window.dispatchEvent(new Event(eventName));
    // Notify positioners again after the resized CSS layout has painted. In
    // particular, exiting zoom changes both media variants and border rounding.
    if (changeFrame) cancelAnimationFrame(changeFrame);
    changeFrame = requestAnimationFrame(() => {
      changeFrame = requestAnimationFrame(() => {
        changeFrame = 0;
        runtime.measureZoom = runtime.model.active;
        window.dispatchEvent(new Event(eventName));
      });
    });
  }
  update();
  window.addEventListener("resize", update);
  document.addEventListener("fullscreenchange", update);
  for (const query of [desktop, browser, screen]) query.addEventListener("change", update);
  window.addEventListener("beforeprint", () => { printing = true; update(); });
  window.addEventListener("afterprint", () => { printing = false; update(); });
  // Reconcile the initial empty body's scrollbar after layout and later content/scrollbar changes.
  const observer = new ResizeObserver(update);
  observer.observe(root);
}

export const DESKTOP_VIEWPORT_SCRIPT = `(${bootstrapDesktopViewport.toString()})(${desktopViewportModel.toString()},${JSON.stringify(STATE_KEY)},${JSON.stringify(DESKTOP_VIEWPORT_CHANGE)});`;
