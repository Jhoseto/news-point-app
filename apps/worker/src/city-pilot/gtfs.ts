import { createHash } from "node:crypto";
import { strFromU8, unzipSync } from "fflate";
import type { PilotItem, PilotSnapshot } from "./parse";
import { buildTimetables } from "./gtfs-timetable";

const required = new Set(["feed_info.txt", "routes.txt", "trips.txt", "stops.txt", "stop_times.txt", "agency.txt"]);
const columns = {
  "feed_info.txt": ["feed_start_date", "feed_end_date", "feed_version"],
  "calendar.txt": ["service_id", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday", "start_date", "end_date"],
  "calendar_dates.txt": ["service_id", "date", "exception_type"],
  "routes.txt": ["route_id", "route_type", "route_short_name", "route_long_name"],
  "trips.txt": ["route_id", "service_id", "trip_headsign", "trip_id"],
  "stops.txt": ["stop_id", "stop_name"],
  "stop_times.txt": ["trip_id", "stop_id", "arrival_time", "departure_time", "stop_sequence"],
  "agency.txt": ["agency_timezone"],
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
  if (new Set(header).size !== header.length || header.some(column => !column)) throw new Error(`GTFS: ${name} duplicate or empty column`);
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
  let hasFrequencies = false;
  let totalSize = 0;
  const accepted = new Set(Object.keys(columns)), extracted = new Set<string>();
  const archive = unzipSync(bytes, { filter: (file) => {
    if (file.name === "frequencies.txt") hasFrequencies = true;
    if (!accepted.has(file.name)) return false;
    if (extracted.has(file.name)) throw new Error(`GTFS: duplicate archive table ${file.name}`);
    extracted.add(file.name);
    totalSize += file.originalSize;
    if (file.originalSize > 6_000_000 || totalSize > 8_000_000) throw new Error("GTFS: extracted tables exceed pilot budget");
    return true;
  } });
  if (hasFrequencies) throw new Error("GTFS: frequency-based trips require separate validation");
  for (const name of required) if (!archive[name]) throw new Error(`GTFS: ${name} missing`);
  if (!archive["calendar.txt"] && !archive["calendar_dates.txt"]) throw new Error("GTFS: service calendar missing");
  const files = archive;
  const agencies = table("agency.txt", files["agency.txt"]!);
  if (!agencies.length || agencies.some(row => row.agency_timezone !== "Europe/Sofia")) throw new Error("GTFS: service timezone changed");
  const today = localDay(now);
  const feed = table("feed_info.txt", files["feed_info.txt"]!);
  if (feed.length !== 1 || !validDay(feed[0]!.feed_start_date!) || !validDay(feed[0]!.feed_end_date!) || !validDay(feed[0]!.feed_version!) || feed[0]!.feed_start_date! > feed[0]!.feed_end_date!) throw new Error("GTFS: invalid feed interval");
  const info = feed[0]!;
  const ageDays = (Date.parse(`${today.slice(0, 4)}-${today.slice(4, 6)}-${today.slice(6, 8)}T12:00:00Z`) - Date.parse(`${info.feed_version!.slice(0, 4)}-${info.feed_version!.slice(4, 6)}-${info.feed_version!.slice(6, 8)}T12:00:00Z`)) / 86_400_000;
  if (today < info.feed_start_date! || today > info.feed_end_date! || ageDays < -1 || ageDays > 3) throw new Error("GTFS: feed is outside the current service window");
  const weekday = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"][new Date(`${today.slice(0, 4)}-${today.slice(4, 6)}-${today.slice(6, 8)}T12:00:00Z`).getUTCDay()]!;
  const calendar = files["calendar.txt"] ? table("calendar.txt", files["calendar.txt"]) : [];
  const serviceIds = new Set<string>(), services = new Set<string>();
  for (const row of calendar) {
    if (!row.service_id?.trim() || serviceIds.has(row.service_id) || !validDay(row.start_date!) || !validDay(row.end_date!) || row.start_date! > row.end_date! || ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"].some(day => row[day] !== "0" && row[day] !== "1")) throw new Error("GTFS: invalid or duplicate service calendar");
    serviceIds.add(row.service_id);
    if (row.start_date! <= today && row.end_date! >= today && row[weekday] === "1") services.add(row.service_id);
  }
  // GTFS uses explicit date overrides, never an inferred holiday/weekend map.
  // Without calendar.txt, calendar_dates.txt defines the service IDs itself.
  const exceptions = files["calendar_dates.txt"] ? table("calendar_dates.txt", files["calendar_dates.txt"]) : [];
  const exceptionKeys = new Set<string>();
  for (const row of exceptions) {
    if (!row.service_id?.trim() || !validDay(row.date!) || !["1", "2"].includes(row.exception_type!)) throw new Error("GTFS: invalid calendar exception");
    const key = JSON.stringify([row.service_id, row.date]);
    if (exceptionKeys.has(key)) throw new Error("GTFS: duplicate or conflicting calendar exception");
    exceptionKeys.add(key);
    if (files["calendar.txt"] && !serviceIds.has(row.service_id)) throw new Error("GTFS: calendar exception references unknown service");
    serviceIds.add(row.service_id);
    if (row.date === today) {
      if (row.exception_type === "1") services.add(row.service_id);
      else services.delete(row.service_id);
    }
  }
  const routes = table("routes.txt", files["routes.txt"]!);
  const trips = table("trips.txt", files["trips.txt"]!);
  if (routes.length === 0 || routes.length > 100 || trips.length === 0 || trips.length > 20_000) throw new Error("GTFS: route or trip count outside pilot budget");
  const keys = new Set<string>(), tripIds = new Set<string>();
  for (const route of routes) {
    if (!route.route_id?.trim() || keys.has(route.route_id) || route.route_type !== "3" || !route.route_short_name || !route.route_long_name) throw new Error("GTFS: incomplete or duplicate bus route");
    keys.add(route.route_id);
  }
  // Check global IDs/references before filtering so an inactive duplicate cannot
  // hide an invalid trip or let its stop times leak into an active trip.
  for (const trip of trips) {
    if (!trip.trip_id?.trim() || tripIds.has(trip.trip_id)) throw new Error("GTFS: duplicate or missing trip ID");
    if (!keys.has(trip.route_id!) || !serviceIds.has(trip.service_id!)) throw new Error("GTFS: trip references unknown route or service");
    tripIds.add(trip.trip_id);
  }
  if (!services.size) throw new Error("GTFS: no service defined for today in Sofia");
  const heads = new Map<string, Set<string>>();
  const activeTrips = trips.filter(trip => services.has(trip.service_id!));
  if (!activeTrips.length) throw new Error("GTFS: no trips defined for today in Sofia");
  const times = table("stop_times.txt", files["stop_times.txt"]!);
  if (times.some(time => !tripIds.has(time.trip_id!))) throw new Error("GTFS: stop time references unknown trip");
  const timetables = buildTimetables(activeTrips, table("stops.txt", files["stops.txt"]!), times);
  for (const trip of activeTrips) {
    if (!trip.route_id || !trip.trip_headsign) throw new Error("GTFS: active trip lacks route or destination");
    const names = heads.get(trip.route_id) ?? new Set<string>();
    names.add(trip.trip_headsign);
    heads.set(trip.route_id, names);
  }
  const items: PilotItem[] = [];
  for (const route of routes) {
    const key = route.route_id!;
    const names = [...(heads.get(key) ?? [])].sort((a, b) => a.localeCompare(b, "bg"));
    if (!names.length) continue;
    if (names.length > 10) throw new Error("GTFS: too many destinations for active bus route");
    const timetable = timetables.get(key);
    if (!timetable?.length) throw new Error("GTFS: route timetable missing");
    const fields = { line: route.route_short_name!, name: route.route_long_name!, destinations: names.join(" · "), serviceDate: `${today.slice(0, 4)}-${today.slice(4, 6)}-${today.slice(6, 8)}`, timetable: JSON.stringify(timetable) };
    items.push({ key, sourceUrl: "https://gtfs.livetransport.eu/gtfs/plovdiv.zip", fields, fingerprint: createHash("sha256").update(JSON.stringify(fields)).digest("hex") });
  }
  return { sourceId: "plovdiv-livetransport-gtfs", items, completeness: "uncertain", limitations: ["Published stop sequences and planned departures cover only the current Sofia service day, including explicit published calendar exceptions, not live vehicle positions or predictions.", "Frequency-based trips are rejected until supported. Missing service dates are not inferred from weekday schedules. Accuracy on the street has not been independently confirmed."] };
}
