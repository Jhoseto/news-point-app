import { expect, it } from "vitest";
import { parsePlovdivAir } from "./air-quality";
const now = new Date("2026-10-26T10:10:00Z");
const row = { sensor: { id: 123, sensor_type: { name: "SDS011" } }, timestamp: "2026-10-26 10:09:00", location: { country: "BG", indoor: 0, latitude: "42.144", longitude: "24.72" }, sensordatavalues: [{ value_type: "P1", value: "13.9" }, { value_type: "P2", value: "8.18" }] };
it("keeps only the latest measured values per outdoor local device, preserving zero", () => {
  const old = { ...row, timestamp: "2026-10-26 10:05:00" };
  const parsed = parsePlovdivAir([old, row], now);
  expect(parsed.items).toHaveLength(1);
  expect(parsed.items[0]?.fields).toMatchObject({ sensorId: "123", measuredAt: "2026-10-26T10:09:00Z", pm10: 13.9, pm25: 8.18 });
  expect(parsePlovdivAir([{ ...row, sensordatavalues: row.sensordatavalues.map(value => ({ ...value, value: "0" })) }], now).items[0]?.fields.pm25).toBe(0);
  expect(parsePlovdivAir([{ ...row, sensordatavalues: [{ value_type: "P1", value: 0 }, { value_type: "P2", value: 0 }, { value_type: "debug", value: 12 }] }], now).items[0]?.fields.pm25).toBe(0);
});
it("rejects malformed responses and excludes stale, future, indoor, foreign and invalid readings", () => {
  expect(() => parsePlovdivAir({ measurements: [] }, now)).toThrow();
  expect(() => parsePlovdivAir([{ changedStructure: true }], now)).toThrow();
  const cases = [{ ...row, timestamp: "2026-10-25 10:00:00" }, { ...row, timestamp: "2026-10-27 10:00:00" }, { ...row, location: { ...row.location, indoor: 1 } }, { ...row, location: { ...row.location, latitude: "42.5" } }, { ...row, sensordatavalues: [{ value_type: "P1", value: "-2" }] }];
  cases.push({ ...row, sensordatavalues: [{ value_type: "P1", value: "999.9" }, { value_type: "P2", value: "999.9" }] });
  expect(parsePlovdivAir(cases, now).items).toEqual([]);
  expect(parsePlovdivAir([], now).items).toEqual([]);
});
