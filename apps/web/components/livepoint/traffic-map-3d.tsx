"use client";

import { useEffect, useRef, useState } from "react";
import type { TrafficIncident } from "@/lib/livepoint/types";
import {
  TOMTOM_FLOW_REFRESH_MS,
  tomTomFlowTileTemplate,
} from "@/lib/livepoint/traffic/flow-tiles";
import { CesiumTrafficLayer } from "@/lib/livepoint/traffic/cesium-traffic-layer";
import { TrafficIncidentHoverCard } from "./traffic-incident-hover-card";
import { useReducedMotion } from "../reader-preferences";

type Position = { lat: number; lon: number };
type MapIncident = Pick<TrafficIncident, "id" | "category" | "position" | "path" | "categoryLabel" | "description" | "from" | "to" | "delaySec">;

const MARKER_PREFIX = "np-marker:";
type CesiumModule = typeof import("cesium");

let cesiumLoader: Promise<CesiumModule> | null = null;

function loadCesium(): Promise<CesiumModule> {
  if (!cesiumLoader) {
    cesiumLoader = new Promise((resolve, reject) => {
      const current = (window as Window & { Cesium?: CesiumModule }).Cesium;
      if (current) {
        resolve(current);
        return;
      }
      (window as Window & { CESIUM_BASE_URL?: string }).CESIUM_BASE_URL = "/cesium/";
      if (!document.querySelector("link[data-cesium-widgets]")) {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = "/cesium/Widgets/widgets.css";
        link.dataset.cesiumWidgets = "true";
        document.head.appendChild(link);
      }
      const script = document.createElement("script");
      script.src = "/cesium/Cesium.js";
      script.async = true;
      script.onload = () => {
        const loaded = (window as Window & { Cesium?: CesiumModule }).Cesium;
        if (loaded) resolve(loaded);
        else reject(new Error("Cesium не се зареди."));
      };
      script.onerror = () => reject(new Error("Cesium не се зареди."));
      document.head.appendChild(script);
    });
  }
  return cesiumLoader;
}

export function TrafficMap3D({ className, token, focusPosition, incidents, showFlow, showMarkers, showMotion = false, onSelectIncident }: {
  className: string;
  token?: string | undefined;
  focusPosition?: Position | null;
  incidents: MapIncident[];
  showFlow: boolean;
  showMarkers: boolean;
  showMotion?: boolean;
  onSelectIncident?: (id: string) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();
  const viewer = useRef<import("cesium").Viewer | null>(null);
  const cesium = useRef<typeof import("cesium") | null>(null);
  const entityIds = useRef<string[]>([]);
  const trafficLayer = useRef<CesiumTrafficLayer | null>(null);
  const [mapKey, setMapKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [photoMode, setPhotoMode] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [flowTick, setFlowTick] = useState(0);
  const [hover, setHover] = useState<{ id: string; x: number; y: number } | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    fetch("/api/livepoint/traffic/?mapKey=1", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("map key unavailable");
        return (await response.json()) as { key?: string };
      })
      .then((data) => { if (!cancelled) data.key ? setMapKey(data.key) : setError("Липсва ключ за картата."); })
      .catch(() => { if (!cancelled) setError("Картата не е достъпна в момента."); });
    return () => { cancelled = true; };
  }, [token]);

  useEffect(() => {
    if (!showFlow || photoMode) return;
    const timer = window.setInterval(() => setFlowTick((value) => value + 1), TOMTOM_FLOW_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [showFlow, photoMode]);

  useEffect(() => {
    if (!host.current || !token || !mapKey) return;
    let disposed = false;
    let localViewer: import("cesium").Viewer | null = null;
    let finished = false;
    const timeout = window.setTimeout(() => {
      if (!disposed && !finished) setError("3D картата не се зареди. Опитайте отново.");
    }, 25_000);
    (async () => {
      try {
        const C = await loadCesium();
        if (disposed || !host.current) return;
        C.Ion.defaultAccessToken = token;
        cesium.current = C;
        let photoTiles: import("cesium").Cesium3DTileset | null = null;
        try {
          photoTiles = await C.createGooglePhotorealistic3DTileset({ onlyUsingWithGoogleGeocoder: true });
        } catch {
          if (!disposed) setNotice("Фотореалистичният слой не е достъпен с този токен. Показваме въздушна снимка и OSM сгради.");
        }
        if (disposed || !host.current) return;
        const [terrain, aerial] = photoTiles ? [null, null] : await Promise.all([
          C.createWorldTerrainAsync(),
          C.createWorldImageryAsync({ style: C.IonWorldImageryStyle.AERIAL }),
        ]);
        if (disposed || !host.current) return;
        localViewer = new C.Viewer(host.current, {
          baseLayerPicker: false, baseLayer: photoTiles ? false : new C.ImageryLayer(aerial!),
          animation: false, timeline: false,
          geocoder: photoTiles ? C.IonGeocodeProviderType.GOOGLE : false,
          homeButton: false,
          sceneModePicker: false, navigationHelpButton: false, fullscreenButton: false,
          infoBox: false, selectionIndicator: false,
          requestRenderMode: true,
          maximumRenderTimeChange: Infinity,
          ...(photoTiles ? { globe: false } : { terrainProvider: terrain! }),
        });
        if (photoTiles && localViewer.geocoder?.container instanceof HTMLElement) {
          localViewer.geocoder.container.style.display = "none";
        }
        localViewer.clock.shouldAnimate = true;
        viewer.current = localViewer;
        localViewer.camera.setView({ destination: C.Cartesian3.fromDegrees(24.7453, photoTiles ? 42.1294 : 42.1354, photoTiles ? 850 : 1200), orientation: { heading: 0, pitch: C.Math.toRadians(photoTiles ? -55 : -70), roll: 0 } });
        if (photoTiles) {
          localViewer.scene.primitives.add(photoTiles);
          setPhotoMode(true);
        } else {
          const buildings = await C.createOsmBuildingsAsync();
          if (disposed || !localViewer || localViewer.isDestroyed()) return;
          localViewer.scene.primitives.add(buildings);
          setPhotoMode(false);
        }
        if (host.current) {
          host.current.querySelectorAll(".cesium-viewer-bottom").forEach((node) => {
            if (node instanceof HTMLElement) node.style.display = "none";
          });
        }
        finished = true;
        window.clearTimeout(timeout);
        setError(null);
        setReady(true);
      } catch {
        finished = true;
        window.clearTimeout(timeout);
        if (!disposed) setError("3D теренът или въздушните снимки не се заредиха. Проверете Cesium ion достъпа.");
      }
    })();
    return () => {
      disposed = true;
      window.clearTimeout(timeout);
      trafficLayer.current?.dispose();
      trafficLayer.current = null;
      if (localViewer && !localViewer.isDestroyed()) localViewer.destroy();
      viewer.current = null;
      cesium.current = null;
      setReady(false);
      setPhotoMode(false);
    };
  }, [token, mapKey]);

  useEffect(() => {
    const C = cesium.current;
    const map = viewer.current;
    if (!C || !map || !ready || !mapKey || photoMode) return;
    while (map.imageryLayers.length > 1) map.imageryLayers.remove(map.imageryLayers.get(1)!);
    if (showFlow) {
      map.imageryLayers.addImageryProvider(new C.UrlTemplateImageryProvider({
        url: tomTomFlowTileTemplate("relative", mapKey, flowTick),
        credit: "TomTom Traffic Flow",
      }));
    }
  }, [showFlow, flowTick, ready, mapKey, photoMode]);

  useEffect(() => {
    const C = cesium.current;
    const map = viewer.current;
    if (!C || !map || !ready) return;

    for (const id of entityIds.current) map.entities.removeById(id);
    entityIds.current = [];

    if (showMarkers) {
      for (const incident of incidents) {
        if (!incident.position) continue;
        const entityId = `${MARKER_PREFIX}${incident.id}`;
        map.entities.add({
          id: entityId,
          position: C.Cartesian3.fromDegrees(incident.position.lon, incident.position.lat),
          point: {
            pixelSize: 12,
            color: C.Color.ORANGE,
            outlineColor: C.Color.WHITE,
            outlineWidth: 2,
            heightReference: C.HeightReference.CLAMP_TO_GROUND,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
        });
        entityIds.current.push(entityId);
      }
    }

    map.scene.requestRender();
  }, [incidents, showMarkers, ready, photoMode]);

  useEffect(() => {
    const C = cesium.current;
    const map = viewer.current;
    if (!C || !map || !ready) return;

    if (!trafficLayer.current) {
      trafficLayer.current = new CesiumTrafficLayer(map, C);
    }

    const layer = trafficLayer.current;
    layer.setEnabled(showMotion && !reduceMotion);
    if (showMotion && !reduceMotion) void layer.refreshRoads(incidents);

    return () => {
      layer.setEnabled(false);
    };
  }, [incidents, showMotion, ready, reduceMotion]);

  useEffect(() => {
    const C = cesium.current;
    const map = viewer.current;
    if (!C || !map || !ready) return;
    const handler = new C.ScreenSpaceEventHandler(map.scene.canvas);
    handler.setInputAction((event: { position: import("cesium").Cartesian2 }) => {
      const picked = map.scene.pick(event.position);
      const rawId = picked?.id?.id as string | undefined;
      if (rawId?.startsWith(MARKER_PREFIX)) onSelectIncident?.(rawId.slice(MARKER_PREFIX.length));
    }, C.ScreenSpaceEventType.LEFT_CLICK);
    handler.setInputAction((event: { endPosition: import("cesium").Cartesian2 }) => {
      const picked = map.scene.pick(event.endPosition);
      const rawId = picked?.id?.id as string | undefined;
      if (rawId?.startsWith(MARKER_PREFIX)) {
        setHover({ id: rawId.slice(MARKER_PREFIX.length), x: event.endPosition.x, y: event.endPosition.y });
      } else {
        setHover(null);
      }
    }, C.ScreenSpaceEventType.MOUSE_MOVE);
    return () => { handler.destroy(); setHover(null); };
  }, [ready, onSelectIncident]);

  useEffect(() => {
    const C = cesium.current;
    const map = viewer.current;
    if (!C || !map || !focusPosition) return;
    map.camera.flyTo({ destination: C.Cartesian3.fromDegrees(focusPosition.lon, focusPosition.lat - (photoMode ? 0.006 : 0), photoMode ? 850 : 950), orientation: { heading: 0, pitch: C.Math.toRadians(photoMode ? -55 : -70), roll: 0 }, duration: reduceMotion ? 0 : 0.7 });
  }, [focusPosition, ready, photoMode, reduceMotion]);

  const hoveredIncident = hover ? incidents.find((item) => item.id === hover.id) : null;

  if (!token) return <div className={`flex items-center justify-center bg-surface-2 px-6 text-center text-sm text-body ${className}`} role="status">3D изгледът очаква Cesium ion токен в локалната конфигурация.</div>;
  return (
    <div className={`np-traffic-map-3d relative bg-surface-2 ${className}`}>
      <div ref={host} className="absolute inset-0 overflow-hidden" aria-label="3D карта на трафика в Пловдив" />
      {hoveredIncident && hover && (
        <div className="pointer-events-none absolute z-20" style={{ left: hover.x, top: hover.y, transform: "translate(-50%, calc(-100% - 0.65rem))" }}>
          <TrafficIncidentHoverCard incident={hoveredIncident} />
        </div>
      )}
      {ready && notice && !photoMode && <p className="absolute top-2 left-2 max-w-[80%] rounded-lg bg-surface/90 px-3 py-2 text-xs text-ink">{notice}</p>}
      {(!ready || error) && <div className="absolute inset-0 flex items-center justify-center bg-surface-2 px-6 text-center text-sm text-body" role="status">{error ?? "Зареждане на 3D картата…"}</div>}
    </div>
  );
}
