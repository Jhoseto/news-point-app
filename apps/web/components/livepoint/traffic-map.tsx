"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";

const TILE = 256;
type Position = { lat: number; lon: number };
type Tile = { x: number; y: number; left: number; top: number; center: boolean };

function toPixels({ lat, lon }: Position, zoom: number) {
  const size = TILE * 2 ** zoom;
  const radians = (Math.max(-85.0511, Math.min(85.0511, lat)) * Math.PI) / 180;
  return {
    x: ((lon + 180) / 360) * size,
    y: ((1 - Math.log(Math.tan(radians) + 1 / Math.cos(radians)) / Math.PI) / 2) * size,
  };
}

function fromPixels(x: number, y: number, zoom: number): Position {
  const size = TILE * 2 ** zoom;
  return {
    lon: (x / size) * 360 - 180,
    lat: (Math.atan(Math.sinh(Math.PI * (1 - (2 * Math.max(0, Math.min(size, y))) / size))) * 180) / Math.PI,
  };
}

function visibleTiles(center: Position, zoom: number, width: number, height: number): Tile[] {
  const world = toPixels(center, zoom);
  const firstX = Math.floor((world.x - width / 2) / TILE);
  const lastX = Math.floor((world.x + width / 2) / TILE);
  const firstY = Math.floor((world.y - height / 2) / TILE);
  const lastY = Math.floor((world.y + height / 2) / TILE);
  const max = 2 ** zoom;
  const tiles: Tile[] = [];
  for (let y = firstY; y <= lastY; y += 1) {
    if (y < 0 || y >= max) continue;
    for (let x = firstX; x <= lastX; x += 1) {
      tiles.push({
        x: ((x % max) + max) % max,
        y,
        left: x * TILE - world.x + width / 2,
        top: y * TILE - world.y + height / 2,
        center: x === Math.floor(world.x / TILE) && y === Math.floor(world.y / TILE),
      });
    }
  }
  return tiles;
}

/** Raster tiles remain visible where the legacy WebGL SDK produces an empty canvas. */
export function TrafficMap({ className = "", focusPosition }: { className?: string; focusPosition?: Position | null }) {
  const host = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; center: Position } | null>(null);
  const [key, setKey] = useState<string | null>(null);
  const [center, setCenter] = useState<Position>({ lat: 42.1354, lon: 24.7453 });
  const [zoom, setZoom] = useState(12);
  const [size, setSize] = useState({ width: 600, height: 320 });
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flowUnavailable, setFlowUnavailable] = useState(false);

  useEffect(() => {
    if (!host.current) return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(host.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/livepoint/traffic/?mapKey=1", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("map key unavailable");
        return (await response.json()) as { key?: string; center?: Position };
      })
      .then((data) => {
        if (cancelled) return;
        if (!data.key) throw new Error("map key missing");
        if (data.center) setCenter(data.center);
        setKey(data.key);
      })
      .catch(() => { if (!cancelled) setError("Картата не е достъпна в момента."); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => { if (focusPosition) setCenter(focusPosition); }, [focusPosition]);

  const tiles = key ? visibleTiles(center, zoom, size.width, size.height) : [];
  const url = (tile: Tile, layer: "base" | "flow" | "incidents") => {
    const path = layer === "base"
      ? `/map/1/tile/basic/main/${zoom}/${tile.x}/${tile.y}.png`
      : layer === "flow"
        ? `/traffic/map/4/tile/flow/relative0/${zoom}/${tile.x}/${tile.y}.png`
        : `/traffic/map/4/tile/incidents/s3/${zoom}/${tile.x}/${tile.y}.png`;
    return `https://api.tomtom.com${path}?key=${encodeURIComponent(key!)}`;
  };

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    drag.current = { x: event.clientX, y: event.clientY, center };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!drag.current) return;
    const start = toPixels(drag.current.center, zoom);
    setCenter(fromPixels(start.x - (event.clientX - drag.current.x), start.y - (event.clientY - drag.current.y), zoom));
  }

  function onPointerEnd(event: PointerEvent<HTMLDivElement>) {
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  if (error) return <div className={`flex items-center justify-center px-4 text-center text-sm text-muted ${className}`}>{error}</div>;

  return (
    <div ref={host} className={`relative overflow-hidden bg-surface-2 ${className}`}>
      {key && (
        <div className="absolute inset-0 cursor-grab touch-none active:cursor-grabbing" aria-label="Карта на трафика в Пловдив. Преместете с мишка или докосване." onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerEnd} onPointerCancel={onPointerEnd}>
          {tiles.map((tile) => (
            <div key={`${zoom}-${tile.x}-${tile.y}`} className="pointer-events-none absolute" style={{ left: tile.left, top: tile.top, width: TILE, height: TILE }}>
              {/* TomTom supplies dynamic tile images that cannot use Next Image optimization. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url(tile, "base")} alt="" draggable={false} width={TILE} height={TILE} onLoad={tile.center ? () => setReady(true) : undefined} onError={tile.center ? () => setError("Картата не се зареди от TomTom.") : undefined} />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="absolute inset-0" src={url(tile, "flow")} alt="" draggable={false} width={TILE} height={TILE} onError={tile.center ? () => setFlowUnavailable(true) : undefined} />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="absolute inset-0" src={url(tile, "incidents")} alt="" draggable={false} width={TILE} height={TILE} />
            </div>
          ))}
        </div>
      )}
      {!ready && <div className="absolute inset-0 flex items-center justify-center bg-surface-2 text-sm font-semibold text-muted" role="status">Зареждане на картата…</div>}
      {flowUnavailable && <p className="absolute bottom-7 left-2 rounded-md bg-surface/90 px-2 py-1 text-xs text-ink">Слоят за трафик е временно недостъпен.</p>}
      <div className="absolute top-2 right-2 flex flex-col overflow-hidden rounded-lg border border-line bg-surface shadow-sm">
        <button type="button" className="px-3 py-1 text-lg font-semibold text-ink hover:bg-surface-2 disabled:opacity-40" aria-label="Приближи картата" disabled={zoom >= 16} onClick={() => setZoom(zoom + 1)}>+</button>
        <button type="button" className="border-t border-line px-3 py-1 text-lg font-semibold text-ink hover:bg-surface-2 disabled:opacity-40" aria-label="Отдалечи картата" disabled={zoom <= 9} onClick={() => setZoom(zoom - 1)}>−</button>
      </div>
      <span className="absolute right-2 bottom-1 rounded bg-surface/85 px-1.5 text-[10px] text-muted">© TomTom</span>
    </div>
  );
}
