/** TomTom TrafficFlowTilesTier default refresh (min 30s). See Traffic Tutorial, Maps SDK Web v6. */
export const TOMTOM_FLOW_REFRESH_MS = 30_000;

/** Raster flow styles: tomtom://vector/1/{style} */
export type TomTomFlowStyle = "relative" | "absolute" | "relative-delay";

export const TOMTOM_FLOW_STYLES: { id: TomTomFlowStyle; label: string; hint: string }[] = [
  { id: "relative", label: "Относителен", hint: "Натоварване спрямо свободен поток" },
  { id: "absolute", label: "Абсолютен", hint: "Скорост по участъка" },
  { id: "relative-delay", label: "Забавяне", hint: "Относително забавяне по TomTom" },
];

/** TrafficIncidentTier default raster style in TomTom traffic tutorial. */
export type TomTomIncidentRasterStyle = "s0" | "s1";

export function tomTomFlowTileTemplate(style: TomTomFlowStyle, apiKey: string, cacheBust?: number): string {
  const extra = cacheBust !== undefined ? `&t=${cacheBust}` : "";
  return `https://api.tomtom.com/traffic/map/4/tile/flow/${style}/{z}/{x}/{y}.png?key=${encodeURIComponent(apiKey)}${extra}`;
}

export function tomTomIncidentTileTemplate(style: TomTomIncidentRasterStyle, apiKey: string, cacheBust?: number): string {
  const t = cacheBust !== undefined ? cacheBust : -1;
  return `https://api.tomtom.com/traffic/map/4/tile/incidents/${style}/{z}/{x}/{y}.png?key=${encodeURIComponent(apiKey)}&t=${t}`;
}
