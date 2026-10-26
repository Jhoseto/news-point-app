import { createHash } from "node:crypto";
import { z } from "zod";
import type { PilotSnapshot } from "./parse";

export const PLOVDIV_AIR_URL = "https://data.sensor.community/airrohr/v1/filter/box=42.10,24.68,42.19,24.82";
const rowSchema = z.object({
  sensor: z.object({ id: z.number().int().positive(), sensor_type: z.object({ name: z.string() }) }),
  timestamp: z.string().regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/u),
  location: z.object({ country: z.string(), indoor: z.number(), latitude: z.string(), longitude: z.string() }),
  sensordatavalues: z.array(z.object({ value_type: z.string(), value: z.union([z.string(), z.number()]) })).max(30),
});
export function parsePlovdivAir(input: unknown, now = new Date()): PilotSnapshot {
  const rows = z.array(rowSchema).max(5000).parse(input);
  const latest = new Map<string, { key: string; fields: Record<string, string | number>; sourceUrl: string; fingerprint: string }>();
  for (const row of rows) {
    if (row.sensor.sensor_type.name !== "SDS011" || row.location.country !== "BG" || row.location.indoor !== 0) continue;
    const lat = Number(row.location.latitude), lon = Number(row.location.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < 42.10 || lat > 42.19 || lon < 24.68 || lon > 24.82) continue;
    const measuredAt = `${row.timestamp.replace(" ", "T")}Z`, age = now.getTime() - Date.parse(measuredAt);
    if (!Number.isFinite(age) || age < 0 || age > 20 * 60_000) continue;
    if (new Date(measuredAt).toISOString().slice(0, 19) + "Z" !== measuredAt) continue;
    const read = (type: string) => {
      const raw = String(row.sensordatavalues.find(value => value.value_type === type)?.value ?? "");
      if (!raw || !/^\d+(?:\.\d+)?$/u.test(raw)) return null;
      const value = Number(raw);
      return Number.isFinite(value) && value >= 0 && value <= 10000 ? value : null;
    };
    const pm10 = read("P1"), pm25 = read("P2");
    // Match the public network map's quality cutoffs; these are not health limits.
    if (pm10 === null || pm25 === null || pm10 >= 1000 || pm25 >= 500) continue;
    const key = String(row.sensor.id);
    if (String(latest.get(key)?.fields.measuredAt ?? "") >= measuredAt) continue;
    const fields = { sensorId: key, measuredAt, pm10, pm25, device: "SDS011" };
    latest.set(key, { key, fields, sourceUrl: PLOVDIV_AIR_URL, fingerprint: createHash("sha256").update(JSON.stringify(fields)).digest("hex") });
  }
  return { sourceId: "plovdiv-community-air", items: [...latest.values()].sort((a, b) => Number(a.key) - Number(b.key)), completeness: "uncertain", limitations: ["Citizen sensor measurements are indicative, not official regulatory monitoring or a city-wide air quality index.", "Only current outdoor SDS011 readings inside the defined Plovdiv rectangle are included. Missing readings do not mean clean air."] };
}
