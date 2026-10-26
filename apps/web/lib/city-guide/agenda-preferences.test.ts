import { expect, it } from "vitest";
import { agendaDays, agendaPreferences } from "./agenda-preferences";
it("builds a Sofia calendar week across DST and month boundaries", () => {
  expect(agendaDays("2026-10-25")).toEqual(["2026-10-25", "2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31"]);
  expect(agendaDays("2026-12-29").at(-1)).toBe("2027-01-04");
});
it("restores valid preferences but drops expired dates and disappeared venues", () => {
  const raw = JSON.stringify({ kind: "live", period: "week", place: "Old venue", extra: "jazz", day: "2026-10-24", query: "a".repeat(200) });
  expect(agendaPreferences(raw, "2026-10-26", ["New venue"])).toEqual({ kind: "live", period: "week", place: "all", extra: "jazz", day: "", query: "a".repeat(150) });
  expect(agendaPreferences('{"day":"2026-10-30","place":"New venue"}', "2026-10-26", ["New venue"])).toMatchObject({ day: "2026-10-30", place: "New venue" });
});
it("recovers from malformed and untrusted preference values", () => {
  for (const raw of ["broken", "null", "[]", '{"kind":"toString","extra":"__proto__","period":[],"place":42}']) {
    expect(agendaPreferences(raw, "2026-10-26", [])).toEqual({ kind: "all", period: "all", query: "", place: "all", extra: "all", day: "" });
  }
});
