import type { TrafficIncident } from "../types";

/** TomTom incidentDetails LineString geometry — not individual vehicle positions. */
export function incidentsForMotionVisualization(
  incidents: Pick<TrafficIncident, "id" | "path">[],
  limit = 8,
): Pick<TrafficIncident, "id" | "path">[] {
  const result: Pick<TrafficIncident, "id" | "path">[] = [];
  for (const incident of incidents) {
    if (!incident.path || incident.path.length < 2) continue;
    result.push(incident);
    if (result.length >= limit) break;
  }
  return result;
}
