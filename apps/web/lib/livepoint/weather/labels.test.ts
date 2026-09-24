import { describe, expect, it } from "vitest";
import { skyMood, weatherLabel, windDirectionLabel } from "./labels";

describe("weatherLabel", () => {
  it("maps known MET symbol codes", () => {
    expect(weatherLabel("fair_day")).toBe("Предимно ясно");
    expect(weatherLabel("clearsky_night")).toBe("Ясно");
  });

  it("falls back without inventing weather", () => {
    expect(weatherLabel(null)).toBe("Прогноза");
  });
});

describe("skyMood", () => {
  it("treats night symbols and late hours as night", () => {
    expect(skyMood("clearsky_night", 14)).toBe("night");
    expect(skyMood("fair_day", 22)).toBe("night");
    expect(skyMood("rain", 12)).toBe("rain");
  });
});

describe("windDirectionLabel", () => {
  it("maps degrees to Bulgarian compass points", () => {
    expect(windDirectionLabel(0)).toBe("С");
    expect(windDirectionLabel(90)).toBe("И");
    expect(windDirectionLabel(null)).toBeNull();
  });
});
