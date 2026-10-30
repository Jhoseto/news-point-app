import { describe, expect, it } from "vitest";
import { selectCityObservations } from "./local-observations";
import { readerCityGroups } from "./presentation";
import { cityAvailableTopics } from "./topic-coverage";

const now = new Date("2026-10-30T11:00:00Z");
const journey = { date: "2026-10-31", time: "13:00", arrivalDate: "2026-10-31", arrivalTime: "15:00", origin: "Пловдив", destination: "София", departureStation: "QA Пловдив Централна ЖП гара", arrivalStation: "QA София", publisher: "Карат-С / Citylines" };
const document = { line: "1", title: "QA линия 1", validFrom: "2026-09-15", validThrough: "2027-06-30", dayTypes: "Делник / Празник", documents: JSON.stringify([{ hash: "a".repeat(64), title: "QA", pages: 5, text: "QA ".repeat(40) }]) };
function select(id: string, fields: Record<string, string | number>, checkedAt = now.toISOString(), outcome: "observed" | "unavailable" = "observed", at = now) {
  return selectCityObservations("transport", { version: 1, sources: { [id]: { checkedAt, outcome, completeness: "uncertain", limitations: [], items: [{ key: "qa", fields }] } } }, at);
}

describe("transport source visibility and dates", () => {
  it("preserves the actual future journey date, exact station and publisher", () => {
    const groups = select("karat-plovdiv-sofia", journey);
    expect(groups[0]?.items[0]?.fields).toEqual(journey);
    expect(cityAvailableTopics("transport", groups)).toContainEqual({ title: "Междуградски автобуси", href: "#nablyudavani-intercity-buses" });
  });
  it("rejects stale, unavailable and calendar-invalid journeys", () => {
    for (const changes of [{ date: "2026-10-29" }, { date: "2026-02-30" }, { date: "2027-10-30" }, { time: "25:00" }, { arrivalTime: "12:00" }, { departureStation: "" }, { origin: "Варна" }, { publisher: "unknown" }]) {
      expect(select("karat-plovdiv-sofia", { ...journey, ...changes })[0]?.items).toEqual([]);
    }
    expect(select("karat-plovdiv-sofia", journey, "2026-10-30T08:00:00Z")[0]?.items).toEqual([]);
    expect(select("karat-plovdiv-sofia", journey, undefined, "unavailable")[0]?.items).toEqual([]);
  });
  it("does not conceal the new transport panels when a source fails", () => {
    const groups = select("karat-plovdiv-sofia", journey, undefined, "unavailable");
    expect(readerCityGroups(groups)[0]).toMatchObject({ status: "unavailable", items: [] });
  });
  it("uses the Sofia date at midnight independently of server timezone", () => {
    const checkedAt = "2026-10-30T22:01:00Z";
    expect(select("karat-plovdiv-sofia", { ...journey, date: "2026-10-30", arrivalDate: "2026-10-30" }, checkedAt, "observed", new Date(checkedAt))[0]?.items).toEqual([]);
  });
  it("exposes only valid, attached municipal documents within their period", () => {
    expect(select("plovdiv-transit-documents", document)[0]?.items).toHaveLength(1);
    for (const changes of [{ validThrough: "2026-10-29" }, { validFrom: "2026-11-01" }, { validThrough: "2027-02-30" }, { documents: "[]" }, { dayTypes: "Делник" }]) {
      expect(select("plovdiv-transit-documents", { ...document, ...changes })[0]?.items).toEqual([]);
    }
    expect(select("plovdiv-transit-documents", document, "2026-10-28T11:00:00Z")[0]?.items).toEqual([]);
    expect(cityAvailableTopics("transport", select("plovdiv-transit-documents", document))).toContainEqual({ title: "Градски автобуси", href: "#nablyudavani-plovdiv-transit-documents" });
  });
});
