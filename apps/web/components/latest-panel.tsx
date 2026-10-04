"use client";

import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { LiveNewsList } from "./latest-panel-list";

/**
 * Premium mobile bottom sheet for the "Последни" tab. Slides up from the
 * BottomNav on tap, fills the viewport up to the LivePoint strip, and can
 * be pulled back down with a touch drag on the header.
 *
 * Performance: mounted only after the first open (the data fetch runs then),
 * so the initial page load stays free of the panel. The data is cached for
 * the session; subsequent opens revalidate in the background.
 *
 * Animation: pure CSS transforms (translateY / opacity) — compositor only,
 * no layout shift. Drag-to-dismiss uses Pointer Events with `touch-action:
 * pan-y` so the page does not scroll while the user pulls the sheet.
 */
export function LatestPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  // Live translateY during a drag. After touch-end we either snap to 0 (open)
  // or to the panel height (closed). When drag = 0 we use the CSS transition.
  const dragRef = useRef(0);

  // Mount the sheet only after the first open so we don't render the data
  // fetch or the list on pages that never need it.
  useEffect(() => {
    if (open && !mounted) setMounted(true);
  }, [open, mounted]);

  // Two-phase show/hide: visible flips a tick later so the slide-up transition
  // runs on the freshly-mounted element (otherwise the browser paints the
  // final state directly with no animation).
  useEffect(() => {
    if (open) {
      const id = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(id);
    }
    setVisible(false);
  }, [open]);

  // Lock body scroll while the panel is open so the underlying page does
  // not scroll under the sheet.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  // Escape closes.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!mounted) return null;
  return createPortal(
    <LatestPanelPortal
      open={open}
      visible={visible}
      dragRef={dragRef}
      onClose={onClose}
    >
      <LiveNewsList onArticleTap={onClose} />
    </LatestPanelPortal>,
    document.body,
  );
}

function LatestPanelPortal({
  open,
  visible,
  dragRef,
  onClose,
  children,
}: {
  open: boolean;
  visible: boolean;
  dragRef: React.MutableRefObject<number>;
  onClose: () => void;
  children: React.ReactNode;
}) {
  // Backdrop opacity transitions independently of the sheet so a quick
  // close (tap the backdrop while open) does not flash the sheet visible
  // without its dimmed background.
  const backdropStyle: CSSProperties = {
    opacity: open && visible ? 1 : 0,
    pointerEvents: open ? "auto" : "none",
  };

  // Sheet transform combines the open/closed animation with a live drag.
  // translate3d keeps it on the compositor (no layout / paint).
  const translateY = open ? dragRef.current : "100%";
  const sheetStyle: CSSProperties = {
    transform: `translate3d(0, ${translateY === "100%" ? "100%" : `${translateY}px`}, 0)`,
    transition: dragRef.current === 0 ? "transform 320ms cubic-bezier(0.32, 0.72, 0, 1)" : "none",
    pointerEvents: open ? "auto" : "none",
  };

  return (
    <div aria-hidden={!open} className="np-latest-panel-root">
      <div
        onClick={onClose}
        style={backdropStyle}
        className="np-latest-panel-backdrop"
        aria-hidden="true"
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Последни новини"
        aria-hidden={!open}
        style={sheetStyle}
        className="np-latest-panel"
        onPointerDown={(event) => onHeaderPointerDown(event, dragRef, onClose)}
      >
        <header className="np-latest-panel-header">
          <span className="np-latest-panel-handle" aria-hidden="true" />
          <h2 className="np-latest-panel-title">Последни новини</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Затвори"
            className="np-latest-panel-close"
          >
            <CloseGlyph />
          </button>
        </header>
        <div className="np-latest-panel-body">{children}</div>
      </section>
    </div>
  );
}

const DRAG_THRESHOLD_PX = 120;
const DRAG_VELOCITY_THRESHOLD = 0.5;

function onHeaderPointerDown(
  event: ReactPointerEvent<HTMLElement>,
  dragRef: React.MutableRefObject<number>,
  onClose: () => void,
) {
  if (event.pointerType === "mouse" && event.button !== 0) return;
  // Ignore secondary pointers.
  if (event.pointerType !== "touch") {
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
  }
  const startY = event.clientY;
  const startTime = event.timeStamp;
  let lastY = startY;
  let lastT = startTime;

  const onMove = (moveEvent: PointerEvent) => {
    const dy = Math.max(0, moveEvent.clientY - startY);
    dragRef.current = dy;
    lastY = moveEvent.clientY;
    lastT = moveEvent.timeStamp;
    const target = moveEvent.currentTarget as HTMLElement;
    target.style.transform = `translate3d(0, ${dy}px, 0)`;
  };

  const onUp = (upEvent: PointerEvent) => {
    const dy = Math.max(0, upEvent.clientY - startY);
    const dt = Math.max(1, upEvent.timeStamp - startTime);
    const velocity = (lastY - startY) / dt;
    const target = upEvent.currentTarget as HTMLElement;
    target.removeEventListener("pointermove", onMove as EventListener);
    target.removeEventListener("pointerup", onUp as EventListener);
    target.removeEventListener("pointercancel", onUp as EventListener);
    if (dy > DRAG_THRESHOLD_PX || velocity > DRAG_VELOCITY_THRESHOLD) {
      dragRef.current = 0;
      target.style.transform = "";
      onClose();
    } else {
      // Snap back open — reset translate, transition will move it to 0.
      target.style.transform = "";
      dragRef.current = 0;
    }
  };

  const target = event.currentTarget;
  target.addEventListener("pointermove", onMove as EventListener);
  target.addEventListener("pointerup", onUp as EventListener);
  target.addEventListener("pointercancel", onUp as EventListener);
}

function CloseGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}