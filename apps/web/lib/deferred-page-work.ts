type Connection = { saveData?: boolean; effectiveType?: string; downlink?: number };

/** Speculative work is optional; real user navigation is never gated here. */
export function constrainedConnection(connection?: Connection): boolean {
  return !!connection?.saveData || /(^|-)2g$|^3g$/.test(connection?.effectiveType ?? "") ||
    (connection?.downlink !== undefined && connection.downlink > 0 && connection.downlink < 1.5);
}

/** Give eager images/scripts the connection first, then run optional work at idle. */
export function afterCriticalPageLoad(work: () => void, delay = 1200, { skipConstrained = true } = {}): () => void {
  let cancelled = false, completed = false, timer = 0, idle = 0;
  const visible = () => { if (!document.hidden) run(); };
  const run = () => {
    if (cancelled || completed) return;
    if (document.hidden) { document.addEventListener("visibilitychange", visible); return; }
    document.removeEventListener("visibilitychange", visible);
    completed = true;
    const connection = (navigator as Navigator & { connection?: Connection }).connection;
    if (!skipConstrained || !constrainedConnection(connection)) work();
  };
  const loaded = () => {
    timer = window.setTimeout(() => {
      if ("requestIdleCallback" in window) idle = window.requestIdleCallback(run, { timeout: 2000 });
      else run();
    }, delay);
  };
  if (document.readyState === "complete") loaded();
  else window.addEventListener("load", loaded, { once: true });
  return () => {
    cancelled = true;
    window.removeEventListener("load", loaded);
    document.removeEventListener("visibilitychange", visible);
    window.clearTimeout(timer);
    if (idle) window.cancelIdleCallback(idle);
  };
}

/** One-shot preparation with enough margin for native touch/arrow interaction. */
export function whenNearViewport(element: Element, work: () => void): () => void {
  if (!("IntersectionObserver" in window)) { work(); return () => {}; }
  let done = false;
  const observer = new IntersectionObserver(entries => {
    if (done || !entries.some(entry => entry.isIntersecting)) return;
    done = true;
    observer.disconnect(); work();
  }, { rootMargin: "320px 0px" });
  observer.observe(element);
  return () => { done = true; observer.disconnect(); };
}
