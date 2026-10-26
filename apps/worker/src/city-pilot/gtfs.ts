import { createHash } from "node:crypto";
import { strFromU8, unzipSync } from "fflate";
import type { PilotItem, PilotSnapshot } from "./parse";

const required = new Set(["feed_info.txt", "calendar.txt", "routes.txt", "trips.txt"]);
const columns = {
  "feed_info.txt": ["feed_start_date", "feed_end_date", "feed_version"],
  "calendar.txt": ["service_id", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday", "start_date", "end_date"],
  "routes.txt": ["route_id", "route_type", "route_short_name", "route_long_name"],
  "trips.txt": ["route_id", "service_id", "trip_headsign"],
} as const;

function csvLine(line: string): string[] {
  const fields: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index++) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') { value += '"'; index++; }
      else quoted = !quoted;
    } else if (char === "," && !quoted) { fields.push(value); value = ""; }
    else value += char;
  }
  if (quoted) throw new Error("GTFS: broken CSV quotation");
  fields.push(value);
  return fields;
}

function table(name: keyof typeof columns, bytes: Uint8Array): Record<string, string>[] {
  const lines = strFromU8(bytes).replace(/^\uFEFF/u, "").split(/\r?\n/u).filter(Boolean);
  const header = csvLine(lines.shift() ?? "");
  if (!columns[name].every((column) => header.includes(column))) throw new Error(`GTFS: ${name} missing required columns`);
  return lines.map((line) => {
    const values = csvLine(line);
    if (values.length !== header.length) throw new Error(`GTFS: ${name} row width changed`);
    return Object.fromEntries(header.map((key, index) => [key, values[index]!]));
  });
}

function localDay(now: number): string {
  return new Intl.DateTimeFormat("sv-SE", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Europe/Sofia" }).format(new Date(now)).replaceAll("-", "");
}

function validDay(value: string): boolean {
  if (!/^\d{8}$/u.test(value)) return false;
  const date = `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
  const parsed = new Date(`${date}T12:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}

export function parsePlovdivGtfsArchive(bytes: Uint8Array, now = Date.now()): PilotSnapshot {
  if (bytes.byteLength > 4_000_000) throw new Error("GTFS: archive exceeds pilot request budget");
  let hasCalendarExceptions = false;
  const archive = unzipSync(bytes, { filter: (file) => {
    if (file.name === "calendar_dates.txt") hasCalendarExceptions = true;
    return required.has(file.name) && file.originalSize <= 2_000_000;
  } });
  if (hasCalendarExceptions) throw new Error("GTFS: calendar exceptions require separate validation");
  for (const name of required) if (!archive[name]) throw new Error(`GTFS: ${name} missing`);
  const files = Object.fromEntries([...required].map((name) => [name, archive[name]!])) as Record<keyof typeof columns, Uint8Array>;
  if (Object.values(files).reduce((sum, entry) => sum + entry.byteLength, 0) > 3_000_000) throw new Error("GTFS: extracted tables exceed pilot budget");
  const today = localDay(now);
  const feed = table("feed_info.txt", files["feed_info.txt"]);
  if (feed.length !== 1 || !validDay(feed[0]!.feed_start_date!) || !validDay(feed[0]!.feed_end_date!) || !validDay(feed[0]!.feed_version!)) throw new Error("GTFS: invalid feed interval");
  const info = feed[0]!;
  const ageDays = (Date.parse(`${today.slice(0, 4)}-${today.slice(4, 6)}-${today.slice(6, 8)}T12:00:00Z`) - Date.parse(`${info.feed_version!.slice(0, 4)}-${info.feed_version!.slice(4, 6)}-${info.feed_version!.slice(6, 8)}T12:00:00Z`)) / 86_400_000;
  if (today < info.feed_start_date! || today > info.feed_end_date! || ageDays < -1 || ageDays > 3) throw new Error("GTFS: feed is outside the current service window");
  const weekday = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"][new Date(`${today.slice(0, 4)}-${today.slice(4, 6)}-${today.slice(6, 8)}T12:00:00Z`).getUTCDay()]!;
  const calendar = table("calendar.txt", files["calendar.txt"]);
  if (calendar.some((row) => !row.service_id || !validDay(row.start_date!) || !validDay(row.end_date!) || ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"].some((day) => row[day] !== "0" && row[day] !== "1"))) throw new Error("GTFS: invalid service calendar");
  const services = new Set(calendar.filter((row) => row.start_date! <= today && row.end_date! >= today && row[weekday] === "1").map((row) => row.service_id));
  if (!services.size) throw new Error("GTFS: no service defined for today in Sofia");
  const routes = table("routes.txt", files["routes.txt"]);
  const trips = table("trips.txt", files["trips.txt"]);
  if (routes.length === 0 || routes.length > 100 || trips.length === 0 || trips.length > 20_000) throw new Error("GTFS: route or trip count outside pilot budget");
  const heads = new Map<string, Set<string>>();
  for (const trip of trips) {
    if (!services.has(trip.service_id)) continue;
    if (!trip.route_id || !trip.trip_headsign) throw new Error("GTFS: active trip lacks route or destination");
    const names = heads.get(trip.route_id) ?? new Set<string>();
    names.add(trip.trip_headsign);
    heads.set(trip.route_id, names);
  }
  const keys = new Set<string>();
  const items: PilotItem[] = [];
  for (const route of routes) {
    const key = route.route_id;
    if (!key) throw new Error("GTFS: route ID missing");
    const names = [...(heads.get(key) ?? [])].sort((a, b) => a.localeCompare(b, "bg"));
    if (keys.has(key) || route.route_type !== "3" || !route.route_short_name || !route.route_long_name || !names.length || names.length > 10) throw new Error("GTFS: incomplete or duplicate active bus route");
    keys.add(key);
    const fields = { line: route.route_short_name, name: route.route_long_name, destinations: names.join(" · "), serviceDate: `${today.slice(0, 4)}-${today.slice(4, 6)}-${today.slice(6, 8)}` };
    items.push({ key, sourceUrl: "https://gtfs.livetransport.eu/gtfs/plovdiv.zip", fields, fingerprint: createHash("sha256").update(JSON.stringify([key, route.route_short_name, route.route_long_name, names])).digest("hex") });
  }
  return { sourceId: "plovdiv-livetransport-gtfs", items, completeness: "uncertain", limitations: ["Only the route numbers and published destinations for the currently active Sofia service day are extracted.", "The feed's weekday and weekend calendars differ; this preview is not a complete weekly timetable or live vehicle position.", "Stop order, departure times, service exceptions and schedule accuracy still need separate validation."] };
}
