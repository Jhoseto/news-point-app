import { createHash } from "node:crypto";
type Row = Record<string, string>;
type Stop = { id: string; name: string; code: string; times: string[] };
type Pattern = { id: string; destination: string; stops: Stop[] };

function seconds(value: string): number {
  if (!/^(?:[0-3]\d|4[0-7]):[0-5]\d:[0-5]\d$/u.test(value)) throw new Error("GTFS: invalid scheduled time");
  const parts = value.split(":").map(Number);
  return parts[0]! * 3600 + parts[1]! * 60 + parts[2]!;
}

export function buildTimetables(trips: Row[], stops: Row[], times: Row[]): Map<string, Pattern[]> {
  const stopMap = new Map<string, Row>();
  for (const stop of stops) {
    if (!stop.stop_id || (!stop.stop_name && !stop.stop_code) || stopMap.has(stop.stop_id)) throw new Error("GTFS: invalid or duplicate stop");
    stopMap.set(stop.stop_id, stop);
  }
  const tripMap = new Map(trips.map(trip => [trip.trip_id, trip]));
  if (tripMap.size !== trips.length || tripMap.has(undefined) || tripMap.has("")) throw new Error("GTFS: duplicate or missing trip ID");
  const byTrip = new Map<string, Row[]>();
  for (const time of times) {
    if (!tripMap.has(time.trip_id)) continue;
    if (!time.stop_id || !stopMap.has(time.stop_id) || !/^\d+$/u.test(time.stop_sequence ?? "")) throw new Error("GTFS: missing stop or invalid sequence");
    if (time.pickup_type && !["0", "1"].includes(time.pickup_type)) throw new Error("GTFS: on-demand boarding is outside schedule preview");
    if (seconds(time.departure_time!) < seconds(time.arrival_time!)) throw new Error("GTFS: departure before arrival");
    const rows = byTrip.get(time.trip_id!) ?? []; rows.push(time); byTrip.set(time.trip_id!, rows);
  }
  const routes = new Map<string, Map<string, Pattern>>();
  for (const trip of trips) {
    const rows = byTrip.get(trip.trip_id!)?.sort((a, b) => Number(a.stop_sequence) - Number(b.stop_sequence));
    if (!rows || rows.length < 2 || rows.length > 120 || new Set(rows.map(row => Number(row.stop_sequence))).size !== rows.length) throw new Error("GTFS: incomplete stop sequence");
    for (let i = 1; i < rows.length; i++) if (seconds(rows[i]!.arrival_time!) < seconds(rows[i - 1]!.departure_time!)) throw new Error("GTFS: non-monotonic trip times");
    const signature = JSON.stringify([trip.trip_headsign, rows.map(row => row.stop_id)]);
    const patterns = routes.get(trip.route_id!) ?? new Map<string, Pattern>();
    let pattern = patterns.get(signature);
    if (!pattern) {
      pattern = { id: createHash("sha256").update(signature).digest("hex").slice(0, 16), destination: trip.trip_headsign!, stops: rows.map(row => {
        const stop = stopMap.get(row.stop_id!)!;
        return { id: row.stop_id!, name: stop.stop_name || `Спирка ${stop.stop_code} (без посочено име)`, code: stop.stop_code ?? "", times: [] };
      }) }; patterns.set(signature, pattern);
    }
    rows.forEach((row, index) => { if (row.pickup_type !== "1") pattern!.stops[index]!.times.push(row.departure_time!); });
    if (patterns.size > 20) throw new Error("GTFS: too many route variants");
    routes.set(trip.route_id!, patterns);
  }
  return new Map([...routes].map(([route, patterns]) => [route, [...patterns.values()].map(pattern => ({ ...pattern, stops: pattern.stops.map(stop => ({ ...stop, times: [...new Set(stop.times)].sort() })) }))]));
}
