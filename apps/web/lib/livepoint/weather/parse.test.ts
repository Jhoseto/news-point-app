import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseMetCompact } from "./parse";

const here = dirname(fileURLToPath(import.meta.url));
const sample = JSON.parse(readFileSync(join(here, "../fixtures/met-compact-sample.json"), "utf8"));

describe("parseMetCompact", () => {
  it("reads only fields present in the compact schema", () => {
    const forecast = parseMetCompact(sample, new Date("2026-09-24T12:00:00Z"));
    expect(forecast.place).toBe("Пловдив");
    expect(typeof forecast.current.temperatureC).toBe("number");
    expect(forecast.current.symbolCode).toBeTruthy();
    expect(forecast.hours.length).toBeGreaterThan(0);
    expect(forecast.days.length).toBeGreaterThan(0);
    // Compact does not advertise feels-like / UV — they must stay absent.
    expect(forecast.current).not.toHaveProperty("feelsLikeC");
    expect(forecast.current).not.toHaveProperty("uvIndex");
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
