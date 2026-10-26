import { describe, expect, it } from "vitest";
import { parseEcomapCollectionEvents } from "./parse";

function calendar() {
  return [
    { id: "1", title: "Международен ден на природата", start: "2026-10-01", end: null, extendedProps: { description: null } },
    { id: "28", title: "Кампания за събиране на отработени масла", start: "2026-11-23", end: "2026-11-24", extendedProps: { description: '<p>На 23 ноември от 09:00 ч. до 12:00 ч. в Район „Източен“ – ул. „Пример“.</p><p>На 23 ноември от 13:00 ч. до 16:00 ч. в Район „Тракия“ – гарата.</p>' } },
    { id: "29", title: "Кампания за събиране на отработени масла", start: "2026-11-24", end: "2026-11-25", extendedProps: { description: "<p>На 24 ноември от 09:00 ч. до 12:00 ч. – бул. „Пример“.</p>" } },
    { id: "2", title: "Ден на рециклирането", start: "2026-12-01", end: null, extendedProps: { description: null } },
  ];
}

describe("EcoMap collection campaign calendar", () => {
  it("keeps dated campaigns and their published place text, excluding awareness days", () => {
    const snapshot = parseEcomapCollectionEvents(JSON.stringify(calendar()));
    expect(snapshot.items.map(item => item.key)).toEqual(["28", "29"]);
    expect(snapshot.items[0]?.fields.details).toContain("Район „Източен“");
    expect(snapshot.items[0]?.fields.details).toContain("13:00");
    expect(snapshot.completeness).toBe("uncertain");
  });

  it("fails closed on an impossible date, missing time or duplicate campaign ID", () => {
    const invalid = calendar();
    invalid[1]!.start = "2026-11-99";
    expect(() => parseEcomapCollectionEvents(JSON.stringify(invalid))).toThrow();
    const noTime = calendar();
    noTime[1]!.extendedProps.description = "<p>Район „Източен“ – ул. „Пример“.</p>";
    expect(() => parseEcomapCollectionEvents(JSON.stringify(noTime))).toThrow("no usable time");
    const duplicate = calendar();
    duplicate[2]!.id = "28";
    expect(() => parseEcomapCollectionEvents(JSON.stringify(duplicate))).toThrow("duplicate key");
  });
});
