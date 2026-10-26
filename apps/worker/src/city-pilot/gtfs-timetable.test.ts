import { expect, it } from "vitest";
import { buildTimetables } from "./gtfs-timetable";
const trips = [{ route_id: "1", trip_id: "qa1", trip_headsign: "QA крайна спирка" }, { route_id: "1", trip_id: "qa2", trip_headsign: "QA крайна спирка" }];
const stops = [{ stop_id: "a", stop_name: "QA начало", stop_code: "101" }, { stop_id: "b", stop_name: "QA край", stop_code: "102" }];
const time = (trip_id: string, stop_id: string, stop_sequence: string, departure_time: string) => ({ trip_id, stop_id, stop_sequence, departure_time, arrival_time: departure_time });
const rows = [time("qa1", "a", "1", "23:50:00"), time("qa1", "b", "2", "24:05:00"), time("qa2", "a", "1", "08:00:00"), time("qa2", "b", "2", "08:10:00")];
it("groups matching stop paths, sorts scheduled times and preserves after-midnight service hours", () => {
  const patterns = buildTimetables(trips, stops, rows).get("1")!;
  expect(patterns).toHaveLength(1);
  expect(patterns[0]?.stops[0]?.times).toEqual(["08:00:00", "23:50:00"]);
  expect(patterns[0]?.stops[1]?.times).toEqual(["08:10:00", "24:05:00"]);
  const changed = buildTimetables(trips, stops, rows.map((row, i) => i === 0 ? { ...row, arrival_time: "23:55:00", departure_time: "23:55:00" } : row));
  expect(changed.get("1")?.[0]?.stops[0]?.times).toContain("23:55:00");
});
it("rejects incomplete sequences, unknown stops, broken time order and duplicate trips", () => {
  expect(() => buildTimetables(trips, stops, rows.slice(1))).toThrow("incomplete");
  expect(() => buildTimetables(trips, stops.slice(1), rows)).toThrow("missing stop");
  expect(() => buildTimetables(trips, stops, rows.map((row, i) => i === 1 ? { ...row, arrival_time: "22:00:00", departure_time: "22:00:00" } : row))).toThrow("non-monotonic");
  expect(() => buildTimetables([...trips, trips[0]!], stops, rows)).toThrow("duplicate");
});
it("does not show boarding times at no-pickup stops and labels a missing name using the actual code", () => {
  const result = buildTimetables(trips, stops.map(stop => ({ ...stop, stop_name: "" })), rows.map(row => ({ ...row, pickup_type: "1" })));
  expect(result.get("1")?.[0]?.stops[0]).toMatchObject({ name: "Спирка 101 (без посочено име)", times: [] });
});
