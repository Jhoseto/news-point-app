"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";

export type LightboxImage = {
  src: string;
  alt: string;
  caption?: string;
  credit?: string;
};

type Pt = { x: number; y: number };

const MIN_ZOOM = 1;
const MAX_ZOOM = 5;
const ZOOM_STEPS = [1, 1.5, 2, 3, 4, 5];

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

/** Tiny inline icon set so the lightbox ships without depending on the icon library. */
function CloseGlyph(props: { size?: number }) {
  const s = props.size ?? 18;
  return (
    <svg viewBox="0 0 24 24" width={s} height={s} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}
function ChevronLeftGlyph(props: { size?: number }) {
  const s = props.size ?? 20;
  return (
    <svg viewBox="0 0 24 24" width={s} height={s} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m15 6-6 6 6 6" />
    </svg>
  );
}
function ChevronRightGlyph(props: { size?: number }) {
  const s = props.size ?? 20;
  return (
    <svg viewBox="0 0 24 24" width={s} height={s} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}
function MinusGlyph(props: { size?: number }) {
  const s = props.size ?? 18;
  return (
    <svg viewBox="0 0 24 24" width={s} height={s} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12h14" />
    </svg>
  );
}
function PlusGlyph(props: { size?: number }) {
  const s = props.size ?? 18;
  return (
    <svg viewBox="0 0 24 24" width={s} height={s} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
function ImageGlyph(props: { size?: number }) {
  const s = props.size ?? 18;
  return (
    <svg viewBox="0 0 24 24" width={s} height={s} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="2.5" />
      <circle cx="9" cy="10" r="1.5" />
      <path d="m21 16-5-5-9 9" />
    </svg>
  );
}
function ZoomInGlyph(props: { size?: number }) {
  const s = props.size ?? 18;
  return (
    <svg viewBox="0 0 24 24" width={s} height={s} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="6.5" />
      <path d="M20 20l-4.35-4.35M11 8v6M8 11h6" />
    </svg>
  );
}

/**
 * Full-bleed image lightbox.
 *
 * Open behaviour: opens at `openIndex`, closes via `onClose`. The component
 * portals to the body so the site header (which uses backdrop-filter) does
 * not contain the layer. The opener element receives focus on close.
 */
export function ArticleLightbox({
  images,
  openIndex,
  onClose,
  title,
}: {
  images: LightboxImage[];
  openIndex: number;
  onClose: () => void;
  title?: string;
}) {
  const total = images.length;
  const [index, setIndex] = useState(openIndex);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<Pt>({ x: 0, y: 0 });
  const [mounted, setMounted] = useState(false);

  const panel = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const imageWrap = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const opener = useRef<HTMLElement | null>(null);

  const pointers = useRef<Map<number, Pt>>(new Map());
  const pinchStart = useRef<{ distance: number; zoom: number } | null>(null);
  const panStart = useRef<{ pan: Pt; pointer: Pt } | null>(null);
  const swipeStart = useRef<{ x: number; y: number; t: number } | null>(null);

  const current = total > 0 ? images[clamp(index, 0, total - 1)] : null;

  // Fade-in
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  // Reset transform when sliding
  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [index]);

  const close = useCallback(() => onClose(), [onClose]);

  const go = useCallback(
    (next: number) => {
      if (total < 2) return;
      setIndex(((next % total) + total) % total);
    },
    [total],
  );

  const setZoomClamped = useCallback((next: number) => {
    setZoom(clamp(next, MIN_ZOOM, MAX_ZOOM));
  }, []);

  const zoomIn = useCallback(() => {
    setZoom((prev) => {
      const i = ZOOM_STEPS.findIndex((s) => s >= prev - 0.001);
      const safeI = i < 0 ? ZOOM_STEPS.length - 1 : i;
      const next = ZOOM_STEPS[Math.min(safeI + 1, ZOOM_STEPS.length - 1)] ?? MAX_ZOOM;
      if (next <= 1) setPan({ x: 0, y: 0 });
      return clamp(next, MIN_ZOOM, MAX_ZOOM);
    });
  }, []);

  const zoomOut = useCallback(() => {
    setZoom((prev) => {
      const i = ZOOM_STEPS.findIndex((s) => s >= prev - 0.001);
      const safeI = i < 0 ? 0 : i;
      const next = ZOOM_STEPS[Math.max(safeI - 1, 0)] ?? MIN_ZOOM;
      if (next <= 1) setPan({ x: 0, y: 0 });
      return clamp(next, MIN_ZOOM, MAX_ZOOM);
    });
  }, []);

  const resetZoom = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  // Clamp pan so the image never drifts fully off-screen.
  useLayoutEffect(() => {
    if (zoom <= 1 || !imageWrap.current) {
      if (pan.x !== 0 || pan.y !== 0) setPan({ x: 0, y: 0 });
      return;
    }
    const el = imgRef.current;
    if (!el) return;
    const dw = el.clientWidth;
    const dh = el.clientHeight;
    if (dw === 0 || dh === 0) return;
    const maxX = ((zoom - 1) * dw) / 2;
    const maxY = ((zoom - 1) * dh) / 2;
    const nx = clamp(pan.x, -maxX, maxX);
    const ny = clamp(pan.y, -maxY, maxY);
    if (nx !== pan.x || ny !== pan.y) setPan({ x: nx, y: ny });
  }, [zoom, pan.x, pan.y, index]);

  // Focus trap + body lock + opener focus return
  useEffect(() => {
    opener.current = (document.activeElement as HTMLElement | null) ?? null;
    panel.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        go(index - 1);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        go(index + 1);
      } else if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        zoomIn();
      } else if (event.key === "-" || event.key === "_") {
        event.preventDefault();
        zoomOut();
      } else if (event.key === "0") {
        event.preventDefault();
        resetZoom();
      } else if (event.key === "Tab" && panel.current) {
        const items = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((i) => i.offsetParent !== null);
        const first = items[0];
        const last = items.at(-1);
        if (!first || !last) return;
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
      if (opener.current?.isConnected) opener.current.focus({ preventScroll: true });
    };
  }, [close, go, index, zoomIn, zoomOut, resetZoom]);

  // Wheel zoom (no modifier required — the whole lightbox is the zoom context)
  useEffect(() => {
    const node = stage.current;
    if (!node) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const factor = event.deltaY < 0 ? 1.15 : 0.87;
      setZoom((prev) => clamp(prev * factor, MIN_ZOOM, MAX_ZOOM));
    };
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
  }, []);

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 2) {
      const pts = [...pointers.current.values()];
      const a = pts[0]!;
      const b = pts[1]!;
      pinchStart.current = { distance: Math.hypot(a.x - b.x, a.y - b.y), zoom };
      panStart.current = null;
    } else if (pointers.current.size === 1) {
      if (zoom > 1) {
        panStart.current = { pan, pointer: { x: event.clientX, y: event.clientY } };
      } else {
        swipeStart.current = { x: event.clientX, y: event.clientY, t: Date.now() };
      }
    }
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 2 && pinchStart.current) {
      const pts = [...pointers.current.values()];
      const a = pts[0]!;
      const b = pts[1]!;
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      setZoom(clamp(pinchStart.current.zoom * (distance / pinchStart.current.distance), MIN_ZOOM, MAX_ZOOM));
    } else if (pointers.current.size === 1 && panStart.current) {
      const dx = event.clientX - panStart.current.pointer.x;
      const dy = event.clientY - panStart.current.pointer.y;
      setPan({ x: panStart.current.pan.x + dx, y: panStart.current.pan.y + dy });
    }
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const target = event.currentTarget;
    if (target.hasPointerCapture(event.pointerId)) target.releasePointerCapture(event.pointerId);
    pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) pinchStart.current = null;
    if (pointers.current.size === 0) {
      if (swipeStart.current && zoom <= 1 && total > 1) {
        const dx = event.clientX - swipeStart.current.x;
        const dy = event.clientY - swipeStart.current.y;
        const dt = Date.now() - swipeStart.current.t;
        if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 2 && dt < 600) {
          go(index + (dx < 0 ? 1 : -1));
        }
      }
      swipeStart.current = null;
      panStart.current = null;
    }
  };

  const onDoubleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (zoom > 1) {
      resetZoom();
      return;
    }
    const el = imgRef.current;
    if (!el) {
      setZoom(2);
      return;
    }
    const rect = el.getBoundingClientRect();
    const px = (event.clientX - rect.left) / rect.width - 0.5;
    const py = (event.clientY - rect.top) / rect.height - 0.5;
    const target = 2.25;
    setZoom(target);
    setPan({ x: -px * rect.width * (target - 1), y: -py * rect.height * (target - 1) });
  };

  if (!current) return null;

  const overlayClass = `fixed inset-0 z-[80] ${mounted ? "opacity-100" : "opacity-0"} transition-opacity duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]`;
  const imageOpacityClass = mounted ? "opacity-100" : "opacity-0";

  return createPortal(
    <div className={overlayClass} role="dialog" aria-modal="true" aria-label={title ?? "Изглед на снимката"}>
      <div
        className="absolute inset-0 bg-[#020826]/82"
        onClick={(event) => {
          if (event.target === event.currentTarget) close();
        }}
        aria-hidden="true"
      />

      <div ref={panel} className="relative flex h-full flex-col text-white">
        {/* Top bar */}
        <div className="flex shrink-0 items-center justify-between gap-3 px-4 pt-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3 text-sm font-semibold">
            <span className="inline-flex size-9 items-center justify-center rounded-full bg-white/8 text-white ring-1 ring-white/15">
              <ImageGlyph />
            </span>
            {total > 1 ? (
              <span className="tabular-nums text-white/85">
                {index + 1} <span className="text-white/40">/</span> {total}
              </span>
            ) : null}
            <span className="hidden truncate text-white/70 sm:inline">{current.alt}</span>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={close}
              aria-label="Затвори"
              data-autofocus
              className="inline-flex size-10 items-center justify-center rounded-full bg-white/8 text-white ring-1 ring-white/15 hover:bg-white/14"
            >
              <CloseGlyph />
            </button>
          </div>
        </div>

        {/* Stage */}
        <div
          ref={stage}
          className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden px-12"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onDoubleClick={onDoubleClick}
        >
          {total > 1 ? (
            <>
              <button
                type="button"
                onClick={() => go(index - 1)}
                aria-label="Предишна снимка"
                className="absolute left-3 top-1/2 z-10 inline-flex size-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/8 text-white ring-1 ring-white/15 backdrop-blur transition-colors duration-200 hover:bg-white/18 sm:left-5"
              >
                <ChevronLeftGlyph />
              </button>
              <button
                type="button"
                onClick={() => go(index + 1)}
                aria-label="Следваща снимка"
                className="absolute right-3 top-1/2 z-10 inline-flex size-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/8 text-white ring-1 ring-white/15 backdrop-blur transition-colors duration-200 hover:bg-white/18 sm:right-5"
              >
                <ChevronRightGlyph />
              </button>
            </>
          ) : null}

          <div
            ref={imageWrap}
            className="relative flex max-h-full max-w-full items-center justify-center"
            style={{ touchAction: zoom > 1 ? "none" : "pan-y", cursor: zoom > 1 ? "grab" : "zoom-in" }}
          >
            <img
              key={current.src}
              ref={imgRef}
              src={current.src}
              alt={current.alt}
              draggable={false}
              decoding="async"
              className={`np-lb-img max-h-[calc(100dvh-13rem)] max-w-full select-none rounded-xl object-contain shadow-[0_30px_120px_-30px_rgba(0,0,0,0.7)] transition-opacity duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${imageOpacityClass}`}
              style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
            />
          </div>

          {/* Zoom controls */}
          <div className="absolute bottom-4 right-4 z-10 flex items-center gap-1 rounded-full bg-white/8 p-1 ring-1 ring-white/15 backdrop-blur">
            <button
              type="button"
              onClick={zoomOut}
              disabled={zoom <= MIN_ZOOM}
              aria-label="Намали"
              className="inline-flex size-9 items-center justify-center rounded-full text-white transition-colors duration-200 hover:bg-white/14 disabled:opacity-40"
            >
              <MinusGlyph />
            </button>
            <button
              type="button"
              onClick={resetZoom}
              aria-label="Нулирай увеличението"
              className="min-w-12 px-1.5 text-xs font-semibold tabular-nums text-white/85 transition-colors duration-200 hover:bg-white/10 rounded-full py-1.5"
            >
              {Math.round(zoom * 100)}%
            </button>
            <button
              type="button"
              onClick={zoomIn}
              disabled={zoom >= MAX_ZOOM}
              aria-label="Увеличи"
              className="inline-flex size-9 items-center justify-center rounded-full text-white transition-colors duration-200 hover:bg-white/14 disabled:opacity-40"
            >
              <PlusGlyph />
            </button>
          </div>

          {/* Hint */}
          <p className="pointer-events-none absolute bottom-4 left-1/2 hidden -translate-x-1/2 rounded-full bg-white/8 px-3 py-1 text-[0.7rem] font-semibold text-white/70 ring-1 ring-white/15 backdrop-blur sm:block">
            Колело/щипка за увеличение · влачене за панорама · ←/→ за навигация
          </p>
        </div>

        {/* Caption */}
        {(current.caption || current.credit) && (
          <div className="mx-auto max-w-3xl px-4 pb-3 pt-1 text-center text-sm leading-relaxed text-white/90 sm:px-6">
            {current.caption ? <span>{current.caption}</span> : null}
            {current.caption && current.credit ? <span className="mx-1.5 text-white/40">·</span> : null}
            {current.credit ? <span className="text-white/60">Снимка: {current.credit}</span> : null}
          </div>
        )}

        {/* Thumbnails */}
        {total > 1 ? (
          <div className="flex shrink-0 items-center justify-start gap-2 overflow-x-auto px-4 pb-5 sm:justify-center sm:px-6">
            {images.map((img, i) => (
              <button
                key={img.src + i}
                type="button"
                onClick={() => setIndex(i)}
                aria-label={`Към снимка ${i + 1}`}
                aria-current={i === index ? "true" : undefined}
                className={`relative h-14 w-20 shrink-0 overflow-hidden rounded-lg ring-2 transition-all duration-200 ${i === index ? "ring-white shadow-[0_0_0_3px_rgba(255,255,255,0.18)]" : "ring-white/15 hover:ring-white/45"}`}
              >
                <img src={img.src} alt="" className="h-full w-full object-cover" loading="lazy" draggable={false} />
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}