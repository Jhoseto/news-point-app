import { DESKTOP_QUERY } from "./viewport-shell";

export const CAROUSEL_SPEED = 18;
export const LATEST_CAROUSEL_SPEED = 24;
const RESUME_MS = 900;
const PAGE_SCROLL_QUIET_MS = 200;

/** Native scrolling keeps ownership during a gesture and its momentum (also without scrollend). */
export function startCarouselAutoplay({
  viewport, strip, container, speed, motion, mobileOnly,
}: {
  viewport: HTMLElement;
  strip: HTMLElement;
  container: HTMLElement;
  speed: number;
  motion: "to-left" | "to-right";
  mobileOnly: boolean;
}) {
  const desktop = window.matchMedia(DESKTOP_QUERY);
  const pauses = new Set<string>();
  let visible = false;
  let disposed = false;
  let frame = 0;
  let timer = 0;
  let previous: number | null = null;
  let position = viewport.scrollLeft;
  let lastWritten: number | null = null;
  let resumeAt = 0;
  let width = strip.offsetWidth;

  const canRun = () => !disposed && visible && !document.hidden && width > 0 &&
    (!mobileOnly || !desktop.matches) && pauses.size === 0 &&
    !document.documentElement.hasAttribute("data-mobile-pager-visual");
  const stop = () => {
    if (frame) window.cancelAnimationFrame(frame);
    if (timer) window.clearTimeout(timer);
    frame = timer = 0;
    previous = null;
  };
  const wake = () => {
    if (!canRun()) { stop(); return; }
    const delay = resumeAt - performance.now();
    if (delay > 0) {
      stop();
      timer = window.setTimeout(wake, delay);
    } else if (!frame) {
      if (previous === null) position = viewport.scrollLeft;
      frame = window.requestAnimationFrame(tick);
    }
  };
  function tick(now: number) {
    frame = 0;
    if (!canRun() || now < resumeAt) { wake(); return; }
    // Reset time after every pause; cap a delayed frame instead of jumping after a stall.
    const elapsed = previous === null ? 0 : Math.min(64, Math.max(0, now - previous));
    previous = now;
    if (elapsed > 0) {
      const step = elapsed * speed / 1000 * (motion === "to-right" ? -1 : 1);
      position = ((position + step) % width + width) % width;
      lastWritten = position;
      viewport.scrollLeft = position;
    }
    frame = window.requestAnimationFrame(tick);
  }
  const pause = (reason: string) => { pauses.add(reason); wake(); };
  const resume = (reason: string) => { pauses.delete(reason); wake(); };
  const hold = (duration = RESUME_MS) => {
    resumeAt = Math.max(resumeAt, performance.now() + duration);
    wake();
  };
  const onScroll = () => {
    const current = viewport.scrollLeft;
    // Our own async scroll events are recognized by position, not a second RAF
    // that can accidentally hide a real user scroll during the same frame.
    if (lastWritten !== null && Math.abs(current - lastWritten) <= 1) return;
    lastWritten = null;
    hold();
  };
  const onWheel = () => { lastWritten = null; hold(); };
  const onPageScroll = (event: Event) => {
    if (event.target === document) hold(PAGE_SCROLL_QUIET_MS);
  };
  const onPointerDown = (event: PointerEvent) => {
    if (event.pointerType === "mouse") return;
    lastWritten = null;
    pause("touch");
  };
  const onPointerEnd = () => {
    if (!pauses.has("touch")) return;
    hold();
    resume("touch");
  };
  const onEnter = (event: PointerEvent) => { if (event.pointerType === "mouse") pause("hover"); };
  const onLeave = (event: PointerEvent) => { if (event.pointerType === "mouse") resume("hover"); };
  const onFocus = (event: FocusEvent) => {
    if (event.target instanceof HTMLElement && event.target.matches(":focus-visible")) pause("focus");
  };
  const onBlur = (event: FocusEvent) => {
    if (!(event.relatedTarget instanceof Node) || !container.contains(event.relatedTarget)) resume("focus");
  };
  const intersection = new IntersectionObserver(([entry]) => {
    visible = entry?.isIntersecting ?? false;
    wake();
  });
  intersection.observe(viewport);
  const resize = new ResizeObserver(() => { width = strip.offsetWidth; wake(); });
  resize.observe(strip);
  const pager = new MutationObserver(wake);
  pager.observe(document.documentElement, { attributes: true, attributeFilter: ["data-mobile-pager-visual"] });
  viewport.addEventListener("scroll", onScroll, { passive: true });
  viewport.addEventListener("scrollend", onScroll, { passive: true });
  viewport.addEventListener("wheel", onWheel, { passive: true });
  viewport.addEventListener("pointerdown", onPointerDown, { passive: true });
  window.addEventListener("pointerup", onPointerEnd, { passive: true });
  window.addEventListener("pointercancel", onPointerEnd, { passive: true });
  window.addEventListener("scroll", onPageScroll, { passive: true });
  container.addEventListener("pointerenter", onEnter, { passive: true });
  container.addEventListener("pointerleave", onLeave, { passive: true });
  container.addEventListener("focusin", onFocus);
  container.addEventListener("focusout", onBlur);
  document.addEventListener("visibilitychange", wake);
  desktop.addEventListener("change", wake);

  return {
    pause, resume, hold,
    destroy() {
      disposed = true;
      stop();
      intersection.disconnect(); resize.disconnect(); pager.disconnect();
      viewport.removeEventListener("scroll", onScroll);
      viewport.removeEventListener("scrollend", onScroll);
      viewport.removeEventListener("wheel", onWheel);
      viewport.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointerup", onPointerEnd);
      window.removeEventListener("pointercancel", onPointerEnd);
      window.removeEventListener("scroll", onPageScroll);
      container.removeEventListener("pointerenter", onEnter);
      container.removeEventListener("pointerleave", onLeave);
      container.removeEventListener("focusin", onFocus);
      container.removeEventListener("focusout", onBlur);
      document.removeEventListener("visibilitychange", wake);
      desktop.removeEventListener("change", wake);
    },
  };
}
