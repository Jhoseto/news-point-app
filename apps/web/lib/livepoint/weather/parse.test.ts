import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseMetCompact } from "./parse";
import { getWeatherCity } from "./cities";

const here = dirname(fileURLToPath(import.meta.url));
const sample = JSON.parse(readFileSync(join(here, "../fixtures/met-compact-sample.json"), "utf8"));

describe("parseMetCompact", () => {
  it("reads only fields present in the compact schema", () => {
    const forecast = parseMetCompact(sample, new Date("2026-09-24T12:00:00Z"));
    expect(forecast.place).toBe("Пловдив");
    expect(forecast.cityId).toBe("plovdiv");
    expect(typeof forecast.current.temperatureC).toBe("number");
    expect(forecast.current.symbolCode).toBeTruthy();
    expect(forecast.hours.length).toBeGreaterThan(0);
    expect(forecast.days.length).toBeGreaterThan(0);
    // Compact does not advertise feels-like / UV — they must stay absent.
    expect(forecast.current).not.toHaveProperty("feelsLikeC");
    expect(forecast.current).not.toHaveProperty("uvIndex");
  });

  it("labels data with the requested city and advances through cached hours", () => {
    const forecast = parseMetCompact(sample, new Date("2026-09-24T14:30:00Z"), getWeatherCity("smolyan")!);
    expect(forecast.place).toBe("Смолян");
    expect(forecast.cityId).toBe("smolyan");
    expect(forecast.current.time).toBe("2026-09-24T14:00:00Z");
    expect(forecast.hours[0]?.time).toBe(forecast.current.time);
    expect(forecast.hours.every((hour) => Date.parse(hour.time) < Date.parse(forecast.current.time) + 24 * 60 * 60_000)).toBe(true);
  });

  it("rejects exhausted forecasts rather than displaying the last historical hour", () => {
    expect(() => parseMetCompact(sample, new Date("2026-11-20T12:00:00Z"))).toThrow(/current hour/);
  });

  it("rejects payloads without temperature", () => {
    expect(() =>
      parseMetCompact({
        type: "Feature",
        properties: {
          meta: { updated_at: "2026-09-24T00:00:00Z" },
          timeseries: [{ time: "2026-09-24T00:00:00Z", data: { instant: { details: {} } } }],
        },
      }),
    ).toThrow(/air_temperature/);
  });
});
