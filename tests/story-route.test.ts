import { describe, expect, it } from "vitest";
import { articleCountLabel, asDate, calendarDaysBetween, themeChronologyNeighbours, transitLabel } from "../apps/web/lib/story-route";

describe("calendarDaysBetween", () => {
  it("counts Sofia calendar days, not raw 24-hour slices", () => {
    expect(calendarDaysBetween(new Date("2026-03-01T21:00:00.000Z"), new Date("2026-03-02T01:00:00.000Z"))).toBe(1);
  });

  it("is zero on the same Sofia day", () => {
    expect(calendarDaysBetween(new Date("2026-06-10T06:00:00.000Z"), new Date("2026-06-10T20:00:00.000Z"))).toBe(0);
  });
});

describe("transitLabel", () => {
  it("stays silent for same-day hops", () => {
    expect(transitLabel(0)).toBeNull();
  });

  it("names later and earlier hops", () => {
    expect(transitLabel(1)).toBe("1 ден по-късно");
    expect(transitLabel(4)).toBe("4 дни по-късно");
    expect(transitLabel(-2)).toBe("2 дни по-рано");
  });
});

describe("asDate", () => {
  it("revives ISO strings from cache", () => {
    const date = asDate("2026-10-06T12:00:00.000Z");
    expect(date).toBeInstanceOf(Date);
    expect(date?.toISOString()).toBe("2026-10-06T12:00:00.000Z");
  });

  it("returns null for invalid cache values", () => {
    expect(asDate("not-a-date")).toBeNull();
  });
});

describe("articleCountLabel", () => {
  it("uses the Bulgarian singular", () => {
    expect(articleCountLabel(1)).toBe("1 новина");
    expect(articleCountLabel(8)).toBe("8 новини");
  });
});

describe("themeChronologyNeighbours", () => {
  const stops = [
    { articleId: "a", position: 1 },
    { articleId: "b", position: 2 },
    { articleId: "c", position: 3 },
  ];

  it("returns the previous and next stops in editorial order", () => {
    expect(themeChronologyNeighbours(stops, "b")).toEqual({
      previous: stops[0],
      next: stops[2],
      index: 1,
    });
  });

  it("has no previous on the first stop and no next on the last", () => {
    expect(themeChronologyNeighbours(stops, "a")).toEqual({ previous: null, next: stops[1], index: 0 });
    expect(themeChronologyNeighbours(stops, "c")).toEqual({ previous: stops[1], next: null, index: 2 });
  });
});
