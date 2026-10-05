"use client";
import { desktopDistance } from "@/lib/desktop-viewport";

import { useEffect, useRef, useState, type PointerEvent, type KeyboardEvent } from "react";
import { PLOVDIV } from "@/lib/livepoint/config";
import { MAP_TILE_SIZE, pointAtOffset, toPixels, visibleTiles, type MapPosition } from "@/lib/livepoint/map-projection";
import { PinIcon } from "../icons";

export function ReportLocationMap({ point, focusPoint, onSelect }: { point: MapPosition | null; focusPoint: MapPosition | null; onSelect: (point: MapPosition) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; center: MapPosition; moved: boolean } | null>(null);
  const [center, setCenter] = useState<MapPosition>(point ?? PLOVDIV);
  const [zoom, setZoom] = useState(15);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [key, setKey] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/livepoint/traffic/?mapKey=1", { cache: "no-store", signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error();
        const data = await response.json() as { key?: string };
        if (!data.key) throw new Error();
        setKey(data.key);
      })
      .catch(() => { if (!controller.signal.aborted) setError("Картата временно не е достъпна. Опитайте отново по-късно."); });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!host.current) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(host.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => { if (focusPoint) { setCenter(focusPoint); setZoom(16); } }, [focusPoint]);
  const tiles = key && size.width ? visibleTiles(center, zoom, size.width, size.height) : [];
  const origin = toPixels(center, zoom);
  const marker = point ? toPixels(point, zoom) : null;

  function pointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || !ready || error) return;
    if (!event.isPrimary) { drag.current = null; return; }
    event.currentTarget.focus({ preventScroll: true });
    drag.current = { x: event.clientX, y: event.clientY, center, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function pointerMove(event: PointerEvent<HTMLDivElement>) {
    const start = drag.current;
    if (!start) return;
    const dx = desktopDistance(event.clientX - start.x), dy = desktopDistance(event.clientY - start.y);
    if (Math.hypot(dx, dy) > 6) start.moved = true;
    if (start.moved) setCenter(pointAtOffset(start.center, zoom, -dx, -dy));
  }
  function pointerEnd(event: PointerEvent<HTMLDivElement>) {
    const start = drag.current;
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (!start || start.moved || event.type === "pointercancel") return;
    const rect = event.currentTarget.getBoundingClientRect();
    onSelect(pointAtOffset(center, zoom, desktopDistance(event.clientX - rect.left - rect.width / 2), desktopDistance(event.clientY - rect.top - rect.height / 2)));
  }
  function mapKey(event: KeyboardEvent<HTMLDivElement>) {
    const offsets: Record<string, [number, number]> = { ArrowLeft: [-80, 0], ArrowRight: [80, 0], ArrowUp: [0, -80], ArrowDown: [0, 80] };
    const offset = offsets[event.key];
    if (offset) { event.preventDefault(); setCenter(pointAtOffset(center, zoom, ...offset)); }
    if (event.key === "Enter" || event.key === " ") { event.preventDefault(); if (ready && !error) onSelect(center); }
  }

  return (
    <div ref={host} className="relative h-[min(calc(43*var(--np-desktop-vh,1dvh)),22rem)] min-h-48 overflow-hidden rounded-2xl border border-line bg-surface-2 sm:h-[min(calc(46*var(--np-desktop-vh,1dvh)),25rem)]">
      <div role="region" tabIndex={0} aria-label="Избор на място върху картата. Натиснете за точка, плъзнете за преместване. С клавиатура: стрелки и Enter за точка в центъра." className="absolute inset-0 cursor-crosshair touch-none outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-accent/40" onKeyDown={mapKey} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerEnd} onPointerCancel={pointerEnd}>
        {tiles.map(tile => <img key={`${zoom}-${tile.x}-${tile.y}`} src={`https://api.tomtom.com/map/1/tile/basic/main/${zoom}/${tile.x}/${tile.y}.png?key=${encodeURIComponent(key!)}&language=bg-BG&view=Unified`} alt="" draggable={false} width={MAP_TILE_SIZE} height={MAP_TILE_SIZE} className="pointer-events-none absolute select-none" style={{ left: tile.left, top: tile.top, width: MAP_TILE_SIZE, height: MAP_TILE_SIZE }} onLoad={tile.center ? () => setReady(true) : undefined} onError={tile.center ? () => setError("Картата не се зареди от TomTom. Затворете и опитайте отново.") : undefined} />)}
        <span aria-hidden="true" className="pointer-events-none absolute top-1/2 left-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#0b1552]/65 bg-white/30 shadow-[0_0_0_2px_white]" />
        {marker ? <span aria-hidden="true" className="pointer-events-none absolute text-accent drop-shadow-[0_3px_3px_rgb(0_0_0/0.3)]" style={{ left: marker.x - origin.x + size.width / 2, top: marker.y - origin.y + size.height / 2, transform: "translate(-50%, calc(-100% + 4.75px))" }}><PinIcon width={38} height={38} className="fill-white" /></span> : null}
      </div>
      {!ready || error ? <p role={error ? "alert" : "status"} className="pointer-events-none absolute inset-0 flex items-center justify-center bg-surface-2/95 px-6 text-center text-sm font-semibold text-muted">{error ?? "Зареждане на картата…"}</p> : null}
      <div className="absolute top-3 right-3 flex flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-card">
        <button type="button" aria-label="Приближи картата" className="size-11 text-xl font-bold text-ink disabled:opacity-40" disabled={zoom >= 19 || !ready || !!error} onClick={() => setZoom(z => z + 1)}>+</button>
        <button type="button" aria-label="Отдалечи картата" className="size-11 border-t border-line text-xl font-bold text-ink disabled:opacity-40" disabled={zoom <= 3 || !ready || !!error} onClick={() => setZoom(z => z - 1)}>−</button>
      </div>
      <button type="button" className="absolute bottom-7 left-3 rounded-full border border-line bg-surface px-3 py-2 text-xs font-bold text-link shadow-card disabled:opacity-50" disabled={!ready || !!error} onClick={() => onSelect(center)}>Отбележи центъра</button>
      <a href="https://www.tomtom.com/legal/" target="_blank" rel="noopener noreferrer" className="absolute right-0 bottom-0 rounded-tl-lg bg-white/95 px-2 py-0.5 text-[0.625rem] text-[#263354]">© TomTom</a>
    </div>
  );
}
