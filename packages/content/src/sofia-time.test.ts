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
  it("rejects normalized invalid calendar dates and the skipped spring hour", () => {
    expect(sofiaWallToUtc("2026-02-31T12:00")).toBeNull();
    expect(sofiaWallToUtc("2026-04-31T12:00")).toBeNull();
    expect(sofiaWallToUtc("2026-03-29T03:30")).toBeNull();
    expect(sofiaWallToUtc("2028-02-29T12:00")?.toISOString()).toBe("2028-02-29T10:00:00.000Z");
  });
  it("keeps the existing later occurrence for the repeated autumn hour", () => {
    const instant = sofiaWallToUtc("2026-10-25T03:30");
    expect(instant?.toISOString()).toBe("2026-10-25T01:30:00.000Z");
    expect(utcToSofiaWall(instant!)).toBe("2026-10-25T03:30");
    expect(sofiaWallToUtc("2026-01-01T00:01")?.toISOString()).toBe("2025-12-31T22:01:00.000Z");
  });
});
