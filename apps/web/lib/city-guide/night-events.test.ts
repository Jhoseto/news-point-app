import { describe, expect, it } from "vitest";
import { nightEventStatusLabel, nightPeriodMatches, type CityNightEvent } from "./night-events";

const overnight: CityNightEvent = {
  key: "300", title: "Infinite Grooves", place: "Club Code", status: "EventScheduled",
  startDate: "2026-10-24T23:00:00+03:00", endDate: "2026-10-25T06:00:00+02:00",
};

describe("night event periods", () => {
  it("treats an overnight event as ongoing after the daylight-saving change", () => {
    const now = new Date("2026-10-25T03:17:00Z");
    expect(nightEventStatusLabel(overnight, now)).toBe("В МОМЕНТА");
    expect(nightPeriodMatches(overnight, "Сега и после", now)).toBe(true);
    expect(nightPeriodMatches(overnight, "Днес", now)).toBe(true);
    expect(nightPeriodMatches(overnight, "Тази вечер", now)).toBe(false);
    expect(nightPeriodMatches(overnight, "Уикенд", now)).toBe(true);
  });

  it("drops the event at its actual end and preserves explicit cancellations", () => {
    const ended = new Date("2026-10-25T04:00:00Z");
    expect(nightPeriodMatches(overnight, "Сега и после", ended)).toBe(false);
    expect(nightEventStatusLabel({ ...overnight, status: "EventCancelled" }, new Date("2026-10-24T19:00:00Z"))).toBe("ОТМЕНЕНО");
  });
});
