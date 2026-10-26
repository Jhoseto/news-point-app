import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { admissionCalendarLink, collectAdmissionCalendar, parseAdmissionCalendar } from "./admission-calendar";

const text = readFileSync(new URL("../../../../tests/fixtures/city-procedures/dz-calendar-2026.txt", import.meta.url), "utf8");
const document = { text, title: "График 2026", pages: 2, hash: "a".repeat(64) };
const now = new Date("2026-10-26T09:00:00Z");
const url = "https://dz-priem.plovdiv.bg/doc/79";
const html = `<h2 id="pageTitle">Срокове за кандидатстване през 2026 г.</h2><div id="pageContent"><a href="${url}">Изтеглете в pdf формат</a><a href="${url}">pdf</a></div>`;
describe("childcare admission calendar", () => {
  it("keeps three upcoming parent enrollment rounds and distinguishes the five parent steps", () => {
    const snapshot = parseAdmissionCalendar(document, "2026", url, now);
    expect(snapshot.items.map(item => item.key)).toEqual(["2026-11-03", "2026-11-19", "2026-12-10"]);
    expect(snapshot.items[0]?.fields).toMatchObject({ vacanciesDate: "2026-10-26", inPersonDeadline: "2026-10-30", onlineDeadline: "2026-11-02", resultsDate: "2026-11-03", enrollmentDeadline: "2026-11-11", registrationDate: "2026-11-12" });
    expect(parseAdmissionCalendar(document, "2026", url, new Date("2026-12-22T09:00:00Z")).items).toEqual([]);
  });
  it("discovers a single current-year document, tolerating repeated links only", () => {
    expect(admissionCalendarLink(html, now)).toEqual({ year: "2026", url });
    expect(() => admissionCalendarLink(html.replaceAll("2026", "2025"), now)).toThrow();
    expect(() => admissionCalendarLink(html.replaceAll("dz-priem.plovdiv.bg", "example.org"), now)).toThrow();
    expect(() => admissionCalendarLink(html.replace("</div>", '<a href="https://dz-priem.plovdiv.bg/doc/80">pdf</a></div>'), now)).toThrow();
  });
  it("rejects invalid, reordered, missing or duplicated date cells", () => {
    for (const replacement of ["26.10 31.11 02.11 03.11 11.11 12.11", "26.10 30.10 29.10 03.11 11.11 12.11", "26.10 30.10 03.11 11.11 12.11"]) {
      expect(() => parseAdmissionCalendar({ ...document, text: text.replace("26.10 30.10 02.11 03.11 11.11 12.11", replacement) }, "2026", url, now)).toThrow();
    }
    expect(() => parseAdmissionCalendar({ ...document, text: text.replace("Забележки:", "текущо 3 - ноември 26.10 30.10 02.11 03.11 11.11 12.11 Забележки:") }, "2026", url, now)).toThrow();
  });
  it("versions a corrected deadline and propagates an unavailable PDF instead of refreshing old dates", async () => {
    const before = parseAdmissionCalendar(document, "2026", url, now);
    const after = parseAdmissionCalendar({ ...document, text: text.replace("26.10 30.10 02.11", "26.10 29.10 02.11") }, "2026", url, now);
    expect(after.items[0]?.key).toBe(before.items[0]?.key);
    expect(after.items[0]?.fingerprint).not.toBe(before.items[0]?.fingerprint);
    await expect(collectAdmissionCalendar(html, async () => { throw new Error("HTTP 503"); }, now)).rejects.toThrow("HTTP 503");
  });
});
