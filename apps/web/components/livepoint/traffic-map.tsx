"use client";
import { desktopDistance } from "@/lib/desktop-viewport";

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import type { TrafficIncident } from "@/lib/livepoint/types";
import { MAP_TILE_SIZE as TILE, fromPixels, toPixels, visibleTiles, type MapPosition as Position, type MapTile as Tile } from "@/lib/livepoint/map-projection";
import { TrafficIncidentHoverCard } from "./traffic-incident-hover-card";
import { useReducedMotion } from "../reader-preferences";

type MapIncident = Pick<TrafficIncident, "id" | "category" | "position" | "path" | "categoryLabel" | "description" | "from" | "to" | "delaySec">;
type Cluster = { x: number; y: number; incidents: MapIncident[]; position: Position };
type MotionPath = { id: string; d: string; duration: number };

function visibleClusters(incidents: MapIncident[], center: Position, zoom: number, width: number, height: number): Cluster[] {
  const origin = toPixels(center, zoom);
  const buckets = new Map<string, Cluster>();
  const bucketSize = width < 500 ? 64 : 56;
  for (const incident of incidents) {
    if (!incident.position) continue;
    const point = toPixels(incident.position, zoom);
    const x = point.x - origin.x + width / 2;
    const y = point.y - origin.y + height / 2;
    if (x < 16 || y < 16 || x > width - 16 || y > height - 16) continue;
    const bucket = `${Math.floor(x / bucketSize)}:${Math.floor(y / bucketSize)}`;
    const existing = buckets.get(bucket);
    if (existing) existing.incidents.push(incident);
    else buckets.set(bucket, { x, y, position: incident.position, incidents: [incident] });
  }
  return [...buckets.values()];
}

function visibleMotionPaths(incidents: MapIncident[], center: Position, zoom: number, width: number, height: number): MotionPath[] {
  const origin = toPixels(center, zoom);
  const paths: MotionPath[] = [];
  for (const incident of incidents) {
    if (!incident.path || incident.path.length < 2) continue;
    const projected = incident.path.map((position) => {
      const point = toPixels(position, zoom);
      return { x: point.x - origin.x + width / 2, y: point.y - origin.y + height / 2 };
    });
    const visible = projected.flatMap((point, index) =>
      point.x >= -20 && point.x <= width + 20 && point.y >= -20 && point.y <= height + 20 ? [index] : []);
    if (visible.length < 2) continue;
    const points = projected.slice(Math.max(0, visible[0]! - 1), Math.min(projected.length, visible.at(-1)! + 2));
    const length = points.slice(1).reduce((total, point, index) => total + Math.hypot(point.x - points[index]!.x, point.y - points[index]!.y), 0);
    if (length < 26) continue;
    paths.push({
      id: incident.id,
      d: points.map((point, index) => `${index ? "L" : "M"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" "),
      duration: Math.max(7, Math.min(18, length / 13)),
    });
    if (paths.length === 8) break;
  }
  return paths;
}

function markerColor(category: number) {
  if (category === 6) return "bg-amber-600";
  if (category === 7 || category === 8) return "bg-rose-600";
  if (category === 9) return "bg-violet-700";
  return "bg-accent";
}

/** Raster tiles remain visible where the legacy WebGL SDK produces an empty canvas. */
export function TrafficMap({ className = "", focusPosition, incidents = [], onSelectIncident, showFlow = true, showMarkers = true, showMotion = true, mapStyle = "auto" }: {
  className?: string;
  focusPosition?: Position | null;
  incidents?: MapIncident[];
  onSelectIncident?: (id: string) => void;
  showFlow?: boolean;
  showMarkers?: boolean;
  showMotion?: boolean;
  mapStyle?: "auto" | "day" | "night";
}) {
  const host = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();
  const drag = useRef<{ x: number; y: number; center: Position } | null>(null);
  const [key, setKey] = useState<string | null>(null);
  const [center, setCenter] = useState<Position>({ lat: 42.1354, lon: 24.7453 });
  const [zoom, setZoom] = useState(12);
  const [size, setSize] = useState({ width: 600, height: 320 });
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flowUnavailable, setFlowUnavailable] = useState(false);
  const [darkMap, setDarkMap] = useState(false);
  const [hovered, setHovered] = useState<{ id: string; x: number; y: number } | null>(null);

  useEffect(() => {
    const root = document.documentElement;
    const syncTheme = () => setDarkMap(root.getAttribute("data-theme") === "dark");
    syncTheme();
    const observer = new MutationObserver(syncTheme);
    observer.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

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

  useEffect(() => {
    if (!focusPosition) return;
    setCenter(focusPosition);
    setZoom((current) => Math.max(current, 13));
  }, [focusPosition]);

  const tiles = key ? visibleTiles(center, zoom, size.width, size.height) : [];
  const clusters = showMarkers ? visibleClusters(incidents, center, zoom, size.width, size.height) : [];
  const motionPaths = showMotion && ready && !reduceMotion ? visibleMotionPaths(incidents, center, zoom, size.width, size.height) : [];
  const hoveredIncident = hovered ? incidents.find((item) => item.id === hovered.id) : null;
  const url = (tile: Tile, layer: "base" | "flow") => {
    const path = layer === "base"
      ? `/map/1/tile/basic/${mapStyle === "auto" ? (darkMap ? "night" : "main") : (mapStyle === "night" ? "night" : "main")}/${zoom}/${tile.x}/${tile.y}.png`
      : `/traffic/map/4/tile/flow/relative/${zoom}/${tile.x}/${tile.y}.png`;
    return `https://api.tomtom.com${path}?key=${encodeURIComponent(key!)}`;
  };

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    event.currentTarget.focus();
    drag.current = { x: event.clientX, y: event.clientY, center };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!drag.current) return;
    const start = toPixels(drag.current.center, zoom);
    setCenter(fromPixels(start.x - desktopDistance(event.clientX - drag.current.x), start.y - desktopDistance(event.clientY - drag.current.y), zoom));
  }

  function onPointerEnd(event: PointerEvent<HTMLDivElement>) {
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function onMapKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const offsets: Record<string, [number, number]> = {
      ArrowLeft: [-100, 0], ArrowRight: [100, 0], ArrowUp: [0, -100], ArrowDown: [0, 100],
    };
    const offset = offsets[event.key];
    if (!offset) return;
    event.preventDefault();
    const world = toPixels(center, zoom);
    setCenter(fromPixels(world.x + offset[0], world.y + offset[1], zoom));
  }

  if (error) return <div className={`flex items-center justify-center px-4 text-center text-sm text-muted ${className}`}>{error}</div>;

  return (
    <div ref={host} className={`relative overflow-hidden bg-surface-2 ${className}`}>
      {key && (
        <div className="absolute inset-0 cursor-grab touch-none active:cursor-grabbing" role="region" tabIndex={0} aria-label="Карта на трафика в Пловдив. Преместете с мишка, докосване или стрелките на клавиатурата." onKeyDown={onMapKeyDown} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerEnd} onPointerCancel={onPointerEnd}>
          {tiles.map((tile) => (
            <div key={`${zoom}-${tile.x}-${tile.y}`} className="pointer-events-none absolute" style={{ left: tile.left, top: tile.top, width: TILE, height: TILE }}>
              {/* TomTom supplies dynamic tile images that cannot use Next Image optimization. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url(tile, "base")} alt="" draggable={false} width={TILE} height={TILE} onLoad={tile.center ? () => setReady(true) : undefined} onError={tile.center ? () => setError("Картата не се зареди от TomTom.") : undefined} />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {showFlow && <img className="absolute inset-0" src={url(tile, "flow")} alt="" draggable={false} width={TILE} height={TILE} onError={tile.center ? () => setFlowUnavailable(true) : undefined} />}
            </div>
          ))}
        </div>
      )}
      {motionPaths.length > 0 && <svg className="np-traffic-motion pointer-events-none absolute inset-0" width={size.width} height={size.height} viewBox={`0 0 ${size.width} ${size.height}`} aria-hidden="true">
        {motionPaths.map((motion, index) => <g key={motion.id}>
          <animateMotion path={motion.d} dur={`${motion.duration}s`} begin={`${-index * 1.7}s`} repeatCount="indefinite" rotate="auto" />
          <ellipse rx="8" ry="5" fill="rgb(56 24 214 / 0.15)" />
          <rect x="-5" y="-3" width="10" height="6" rx="2" fill="white" stroke="#3818d6" strokeWidth="1.2" />
          <rect x="-1.5" y="-2" width="3" height="4" rx="1" fill="#3818d6" />
        </g>)}
      </svg>}
      {ready && <div className="pointer-events-none absolute inset-0" aria-label="Събития върху картата">
        {clusters.map((cluster) => {
          const first = cluster.incidents[0];
          if (!first) return null;
          const count = cluster.incidents.length;
          return <button
            key={`${Math.round(cluster.x)}-${Math.round(cluster.y)}-${first.id}`}
            type="button"
            className={`pointer-events-auto absolute flex size-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white text-xs font-extrabold text-white shadow-[0_2px_12px_rgb(10_20_84_/_0.45)] transition-transform hover:scale-110 ${markerColor(first.category)}`}
            style={{ left: cluster.x, top: cluster.y }}
            aria-label={count > 1 ? `${count} пътни събития. Приближи.` : "Покажи пътното събитие."}
            onMouseEnter={() => setHovered({ id: first.id, x: cluster.x, y: cluster.y })}
            onMouseLeave={() => setHovered((current) => (current?.id === first.id ? null : current))}
            onFocus={() => setHovered({ id: first.id, x: cluster.x, y: cluster.y })}
            onBlur={() => setHovered((current) => (current?.id === first.id ? null : current))}
            onClick={() => {
              if (count > 1 && zoom < 16) {
                setCenter(cluster.position);
                setZoom(zoom + 1);
              } else onSelectIncident?.(first.id);
            }}
          >{count > 1 ? count : "!"}</button>;
        })}
      </div>}
      {hoveredIncident && hovered && (
        <div className="pointer-events-none absolute z-20" style={{ left: hovered.x, top: hovered.y, transform: "translate(-50%, calc(-100% - 0.65rem))" }}>
          <TrafficIncidentHoverCard incident={hoveredIncident} />
        </div>
      )}
      {!ready && <div className="absolute inset-0 flex items-center justify-center bg-surface-2 text-sm font-semibold text-muted" role="status">Зареждане на картата…</div>}
      {flowUnavailable && showFlow && <p className="absolute bottom-3 left-2 rounded-md bg-surface/90 px-2 py-1 text-xs text-ink">Слоят за трафик е временно недостъпен.</p>}
      <div className="absolute top-2 right-2 flex flex-col overflow-hidden rounded-lg border border-line bg-surface shadow-sm">
        <button type="button" className="min-h-11 min-w-11 px-3 py-1 text-lg font-semibold text-ink hover:bg-surface-2 disabled:opacity-40" aria-label="Приближи картата" disabled={zoom >= 16} onClick={() => setZoom(zoom + 1)}>+</button>
        <button type="button" className="min-h-11 min-w-11 border-t border-line px-3 py-1 text-lg font-semibold text-ink hover:bg-surface-2 disabled:opacity-40" aria-label="Отдалечи картата" disabled={zoom <= 9} onClick={() => setZoom(zoom - 1)}>−</button>
        <button type="button" className="min-h-11 min-w-11 border-t border-line px-3 py-1 text-sm font-bold text-ink hover:bg-surface-2" aria-label="Центрирай картата върху Пловдив" onClick={() => { setCenter({ lat: 42.1354, lon: 24.7453 }); setZoom(12); }}>⌖</button>
      </div>
    </div>
  );
}
