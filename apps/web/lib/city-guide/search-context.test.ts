import { describe, expect, it } from "vitest";
import type { CityObservation } from "./local-observations";
import { cityContextGuidance, cityContextLinks, cityContextSources } from "./search-context";

const observation = (overrides: Partial<CityObservation> = {}): CityObservation => ({
  sourceId: "vik-outages", checkedAt: "2026-10-30T10:00:00.000Z", status: "observed", completeness: "uncertain",
  items: [{ key: "fixture", fields: {} }], ...overrides,
});

describe("city reader context", () => {
  it("names only supplied sources from the requested category and public source policy", () => {
    const result = cityContextSources([
      observation(), observation({ sourceId: "plovdiv-community-air" }), observation({ sourceId: "plovdiv-housing" }), observation({ sourceId: "untrusted-id" }),
    ], "outages");
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: "vik-outages", name: "ВиК Пловдив — бюлетин за прекъсвания", checkedAt: "2026-10-30T10:00:00.000Z", partial: true });
    expect(cityContextSources([observation()], "unknown")).toEqual([]);
    expect(cityContextSources([observation({ sourceId: "plovdiv-housing" })])).toEqual([]);
  });

  it("preserves real collection times and distinguishes failed, stale and empty snapshots", () => {
    expect(cityContextSources([observation({ status: "unavailable", items: [] })])[0]).toMatchObject({ timeLabel: "Последен опит", status: "Временно недостъпна", checkedAt: "2026-10-30T10:00:00.000Z" });
    expect(cityContextSources([observation({ status: "stale", items: [] })])[0]).toMatchObject({ timeLabel: "Получена справка", status: "Очаква обновяване" });
    expect(cityContextSources([observation({ items: [] })])[0]?.status).toBe("Няма текущи записи в получената справка");
    expect(cityContextSources([observation({ checkedAt: "not-a-date" })])[0]?.checkedAt).toBeNull();
  });

  it("deduplicates a source shared between categories without falsely declaring its records empty", () => {
    const result = cityContextSources([
      observation({ sourceId: "epaygo-plovdiv-explicit", items: [] }),
      observation({ sourceId: "epaygo-plovdiv-explicit" }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]?.status).toBe("Има текущи записи");
    const latest = cityContextSources([observation({ checkedAt: "bad" }), observation(), observation({ checkedAt: "2026-10-30T11:00:00.000Z", status: "unavailable", items: [] })]);
    expect(latest[0]).toMatchObject({ checkedAt: "2026-10-30T11:00:00.000Z", status: "Временно недостъпна" });
  });

  it("links only known available sibling routes, never arbitrary supplied paths", () => {
    expect(cityContextLinks(["transport", "parking", "saved", "https://example.test", "parking"], "transport"))
      .toEqual([{ title: "Паркиране", href: "/moyat-plovdiv/parking/" }]);
    expect(cityContextLinks([])).toEqual([]);
  });

  it("explains coverage without treating missing information as absence of events or incidents", () => {
    expect(cityContextGuidance().scope).toContain("липсваща справка не означава");
    expect(cityContextGuidance("outages").scope).toContain("липсата на запис не потвърждава");
    expect(cityContextGuidance("transport").scope).toContain("не показват местоположение на автобус в реално време");
    expect(cityContextGuidance("culture").scope).toContain("не гарантира налични билети");
    expect(cityContextGuidance("__proto__")).toEqual(cityContextGuidance());
  });
});
