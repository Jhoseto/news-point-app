import { resolve } from "node:path";

/** Production never falls back to files in development reports. */
export function cityStorageDirectories(folder: "event-images" | "documents"): string[] {
  if (process.env.CITY_GUIDE_STORAGE_DIR) return [resolve(process.env.CITY_GUIDE_STORAGE_DIR, folder)];
  if (process.env.NODE_ENV !== "development") return [];
  if (process.env.CITY_PILOT_OUTPUT_DIR) return [resolve(process.env.CITY_PILOT_OUTPUT_DIR, folder)];
  const relative = `tests/reports/city-preview-live/${folder}`;
  return [resolve(process.cwd(), relative), resolve(process.cwd(), "../..", relative)];
}
