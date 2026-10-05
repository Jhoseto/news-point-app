"use client";

import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { CloseIcon } from "./icons";
import { LiveNewsList } from "./latest-panel-list";
import { MOBILE_OVERLAY_CHANGE, type MobileOverlay } from "@/lib/mobile-overlays";

/** Mobile-only, lazy-mounted news sheet. The bottom navigation stays usable. */
export function LatestPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [navHeight, setNavHeight] = useState<number>();
  const rootRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const dragRef = useRef<{ pointerId: number; startY: number; startedAt: number; distance: number } | null>(null);

  useEffect(() => {
    if (open) setMounted(true);
  }, [open]);

  useEffect(() => {
    if (!open || !mounted) {
      setVisible(false);
      return;
    }
    // Paint the closed position first, including on the initial lazy mount.
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => setVisible(true));
    });
    return () => { cancelAnimationFrame(first); cancelAnimationFrame(second); };
  }, [open, mounted]);

  useEffect(() => {
    if (!open || !mounted) return;
    const nav = document.querySelector<HTMLElement>(".np-bottom-nav");
    if (!nav) return;
    const measure = () => setNavHeight(nav.getBoundingClientRect().height);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(nav, { box: "border-box" });
    return () => observer.disconnect();
  }, [open, mounted]);

  useEffect(() => {
    if (!open || !mounted) return;
    const previousOverflow = document.body.style.overflow;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); onClose(); }
      if (event.key !== "Tab") return;
      // Include the bottom menu in the keyboard loop; it remains part of this flow.
      const candidates = [...(sheetRef.current?.querySelectorAll<HTMLElement>('a[href], button:not(:disabled)') ?? []),
        ...document.querySelectorAll<HTMLElement>('.np-bottom-nav a[href], .np-bottom-nav button:not(:disabled)')]
        .filter(element => element.offsetParent !== null && !element.closest("[inert]"));
      if (!candidates.length) return;
      const index = candidates.indexOf(document.activeElement as HTMLElement);
      // These surfaces are separate portals: browser DOM order cannot provide this loop.
      const next = index < 0 ? (event.shiftKey ? candidates.length - 1 : 0)
        : (index + (event.shiftKey ? candidates.length - 1 : 1)) % candidates.length;
      event.preventDefault(); candidates[next]?.focus();
    };
    window.addEventListener("keydown", onKey);
    const switchPanel = (event: Event) => { if ((event as CustomEvent<MobileOverlay>).detail !== "latest" && !event.defaultPrevented) onClose(); };
    window.addEventListener(MOBILE_OVERLAY_CHANGE, switchPanel);
    // Header search/rubrics buttons also switch away from this sheet.
    window.addEventListener("np:search", onClose);
    window.addEventListener("np:rubrics", onClose);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(MOBILE_OVERLAY_CHANGE, switchPanel);
      window.removeEventListener("np:search", onClose);
      window.removeEventListener("np:rubrics", onClose);
      if (rootRef.current?.contains(document.activeElement)) trigger?.focus({ preventScroll: true });
      dragRef.current = null;
      if (sheetRef.current) { sheetRef.current.style.transform = ""; sheetRef.current.style.transition = ""; }
    };
  }, [open, mounted, onClose]);

  const startDrag = (event: ReactPointerEvent<HTMLElement>) => {
    if (!event.isPrimary || event.button !== 0 || (event.target as HTMLElement).closest("button")) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { pointerId: event.pointerId, startY: event.clientY, startedAt: event.timeStamp, distance: 0 };
  };
  const moveDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !sheetRef.current) return;
    drag.distance = Math.max(0, event.clientY - drag.startY);
    sheetRef.current.style.transition = "none";
    sheetRef.current.style.transform = `translate3d(0, ${drag.distance}px, 0)`;
  };
  const endDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const distance = Math.max(0, event.clientY - drag.startY);
    const velocity = distance / Math.max(1, event.timeStamp - drag.startedAt);
    const dismiss = event.type !== "pointercancel" && (distance > 120 || (distance > 32 && velocity > 0.5));
    dragRef.current = null;
    if (sheetRef.current) { sheetRef.current.style.transition = ""; sheetRef.current.style.transform = ""; }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (dismiss) onClose();
  };

  if (!mounted) return null;
  return createPortal(
    <div ref={rootRef} aria-hidden={!open} inert={!open} data-visible={open && visible}
      className="np-mobile-sheet-root"
      style={navHeight === undefined ? undefined : { "--np-mobile-nav-h": `${navHeight}px` } as CSSProperties}>
      <div onClick={onClose} className="np-mobile-sheet-backdrop" aria-hidden="true" />
      <section ref={sheetRef} id="np-mobile-latest-panel" role="dialog" aria-labelledby="np-mobile-latest-title"
        className="np-mobile-sheet">
        <header className="np-mobile-sheet-header" onPointerDown={startDrag} onPointerMove={moveDrag}
          onPointerUp={endDrag} onPointerCancel={endDrag}>
          <div className="np-mobile-sheet-handle-row"><span className="np-mobile-sheet-handle" aria-hidden="true" /></div>
          <div className="np-mobile-sheet-title-row">
            <h2 id="np-mobile-latest-title" className="np-mobile-sheet-title"><span className="np-ring" aria-hidden="true" />Последни новини</h2>
            <button ref={closeRef} type="button" onClick={onClose} aria-label="Затвори последните новини" className="np-mobile-sheet-close">
              <CloseIcon width={20} height={20} />
            </button>
          </div>
          <p className="np-mobile-sheet-meta">Последните 24 часа</p>
        </header>
        <div className="np-mobile-sheet-body"><LiveNewsList active={open} onArticleTap={onClose} /></div>
      </section>
    </div>, document.body,
  );
}
