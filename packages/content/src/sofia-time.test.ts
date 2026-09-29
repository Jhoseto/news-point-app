import { describe, expect, it } from "vitest";
import { sofiaWallToUtc, utcToSofiaWall } from "./sofia-time";

describe("Bulgarian civil time", () => {
  it("reads summer time as UTC+3, not as the machine clock", () => {
    const instant = sofiaWallToUtc("2026-09-29T14:00");
    expect(instant?.toISOString()).toBe("2026-09-29T11:00:00.000Z");
    expect(utcToSofiaWall(instant!)).toBe("2026-09-29T14:00");
  });

  it("reads winter time as UTC+2", () => {
    const instant = sofiaWallToUtc("2026-01-15T14:00");
    expect(instant?.toISOString()).toBe("2026-01-15T12:00:00.000Z");
    expect(utcToSofiaWall(instant!)).toBe("2026-01-15T14:00");
  });

  it("rejects a clock that is not a real minute", () => {
    expect(sofiaWallToUtc("2026-09-29T25:00")).toBeNull();
    expect(sofiaWallToUtc("not-a-time")).toBeNull();
  });
});
