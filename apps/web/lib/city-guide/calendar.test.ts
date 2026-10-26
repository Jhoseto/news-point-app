import { expect, it } from "vitest";
import { cityDeadlineCalendar } from "./calendar";

it("exports an all-day deadline across a year boundary and escapes user-visible text", () => {
  const calendar = cityDeadlineCalendar("Данък; имоти, такса\nBEGIN:VEVENT", "2026-12-31");
  expect(calendar).toContain("DTSTART;VALUE=DATE:20261231");
  expect(calendar).toContain("DTEND;VALUE=DATE:20270101");
  expect(calendar.match(/^BEGIN:VEVENT$/gm)).toHaveLength(1);
  expect(calendar).toContain("SUMMARY:Данък\\; имоти\\, такса BEGIN:VEVENT");
  expect(calendar.split("\r\n").every(line => new TextEncoder().encode(line).length <= 75)).toBe(true);
  expect(() => cityDeadlineCalendar("Срок", "2026-02-31")).toThrow("Invalid deadline");
});
