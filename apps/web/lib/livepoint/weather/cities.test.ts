import { describe, expect, it } from "vitest";
import { DEFAULT_WEATHER_CITY, getWeatherCity, WEATHER_CITIES } from "./cities";

describe("weather city catalog", () => {
  it("keeps Plovdiv as default and offers regional capitals and nearby towns", () => {
    expect(DEFAULT_WEATHER_CITY).toMatchObject({ id: "plovdiv", name: "Пловдив", lat: 42.1354, lon: 24.7453 });
    expect(WEATHER_CITIES).toHaveLength(31);
    expect(new Set(WEATHER_CITIES.map((city) => city.id)).size).toBe(WEATHER_CITIES.length);
    for (const id of ["sofia", "smolyan", "varna", "asenovgrad", "karlovo", "bansko", "velingrad"]) {
      expect(getWeatherCity(id)?.id).toBe(id);
    }
  });

  it("allows only named city choices and limits coordinates to four decimals", () => {
    for (const value of ["", "__proto__", "constructor", "SOFIA", "42.1,24.7", "https://example.com", undefined, null]) {
      expect(getWeatherCity(value)).toBeUndefined();
    }
    for (const city of WEATHER_CITIES) {
      expect(city.lat).toBeGreaterThan(41);
      expect(city.lat).toBeLessThan(45);
      expect(city.lon).toBeGreaterThan(22);
      expect(city.lon).toBeLessThan(29);
      expect(city.lat).toBe(Number(city.lat.toFixed(4)));
      expect(city.lon).toBe(Number(city.lon.toFixed(4)));
      if (city.altitude !== undefined) expect(Number.isInteger(city.altitude)).toBe(true);
    }
  });
});
