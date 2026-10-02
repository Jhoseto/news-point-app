/** TomTom TrafficFlowTilesTier default refresh (min 30s). See Traffic Tutorial, Maps SDK Web v6. */
export const TOMTOM_FLOW_REFRESH_MS = 30_000;

/** Raster flow styles: tomtom://vector/1/{style} */
export type TomTomFlowStyle = "relative" | "absolute" | "relative-delay";

export function tomTomFlowTileTemplate(style: TomTomFlowStyle, apiKey: string, cacheBust?: number): string {
  const extra = cacheBust !== undefined ? `&t=${cacheBust}` : "";
  return `https://api.tomtom.com/traffic/map/4/tile/flow/${style}/{z}/{x}/{y}.png?key=${encodeURIComponent(apiKey)}${extra}`;
}
