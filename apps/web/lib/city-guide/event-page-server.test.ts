import { beforeEach, describe, expect, it, vi } from "vitest";
import { cityEventId } from "./event-page";
const mocks = vi.hoisted(() => ({ enabled: vi.fn(), load: vi.fn() }));
vi.mock("./access", () => ({ cityGuideEnabled: mocks.enabled }));
vi.mock("./local-observations", () => ({ loadCityObservations: mocks.load }));
import { loadCityEventPage, loadCityEventPages } from "./event-page-server";

const group = { sourceId: "plovdiv-theatre", checkedAt: "2026-10-30T10:00:00Z", status: "observed", completeness: "complete", items: [{ key: "fixture-event", fields: { title: "Проверочно събитие", dateTime: "01-11-2099 19:00", description: "Проверочно описание" } }] };

beforeEach(() => { vi.clearAllMocks(); mocks.enabled.mockReturnValue(true); mocks.load.mockImplementation(async (category: string) => category === "culture" ? [group] : []); });
describe("public event loading", () => {
  it("uses current approved agenda data and carries its real check time", async () => {
    const pages = await loadCityEventPages();
    expect(pages).toHaveLength(1);
    expect(pages[0]).toMatchObject({ category: "culture", sourceId: "plovdiv-theatre", sourceName: "Драматичен театър Пловдив — програма", checkedAt: group.checkedAt, event: { title: "Проверочно събитие", description: "Проверочно описание" } });
    expect(await loadCityEventPage(pages[0]!.id)).toMatchObject({ id: pages[0]!.id });
  });
  it("rejects invalid IDs before loading data and nonexistent IDs after exact lookup", async () => {
    expect(await loadCityEventPage("../secrets")).toBeNull();
    expect(mocks.load).not.toHaveBeenCalled();
    expect(await loadCityEventPage(cityEventId("fixture:missing"))).toBeNull();
  });
  it("never exposes a disabled guide or stale/unavailable records", async () => {
    mocks.enabled.mockReturnValue(false);
    expect(await loadCityEventPages()).toEqual([]);
    expect(mocks.load).not.toHaveBeenCalled();
    mocks.enabled.mockReturnValue(true);
    for (const status of ["stale", "unavailable"]) {
      mocks.load.mockResolvedValue([{ ...group, status }]);
      expect(await loadCityEventPages()).toEqual([]);
    }
  });
  it("does not turn expired records or arbitrary unknown sources into event pages", async () => {
    mocks.load.mockResolvedValue([{ ...group, items: [{ key: "old", fields: { title: "Old fixture", dateTime: "01-01-2000 19:00" } }] }]);
    expect(await loadCityEventPages()).toEqual([]);
    mocks.load.mockResolvedValue([{ ...group, sourceId: "unapproved", items: [{ key: "new", fields: { title: "Fixture", date: "2099-11-01" } }] }]);
    expect(await loadCityEventPages()).toEqual([]);
  });
  it("treats missing/stale/unavailable snapshots as transient errors, not deleted events", async () => {
    const id = cityEventId("plovdiv-theatre:fixture-event");
    for (const state of [[], [{ ...group, status: "stale" }], [{ ...group, status: "unavailable" }]]) {
      mocks.load.mockResolvedValue(state);
      await expect(loadCityEventPage(id)).rejects.toThrow("temporarily unavailable");
    }
    expect(mocks.load).toHaveBeenCalledWith("culture", "plovdiv-theatre", { preserveEmptySources: true });
  });
  it("returns not found for removed/expired events only with an observed source", async () => {
    mocks.load.mockResolvedValue([{ ...group, items: [] }]);
    expect(await loadCityEventPage(cityEventId("plovdiv-theatre:fixture-event"))).toBeNull();
    mocks.load.mockResolvedValue([{ ...group, items: [{ key: "old", fields: { title: "Old fixture", dateTime: "01-01-2000 19:00" } }] }]);
    expect(await loadCityEventPage(cityEventId("plovdiv-theatre:old"))).toBeNull();
  });
  it("rejects malformed or unknown source IDs without data access even during an outage", async () => {
    mocks.load.mockRejectedValue(new Error("fixture outage"));
    for (const id of ["e-YR", cityEventId("unknown:fixture"), cityEventId("plovdiv-theatre:"), cityEventId("plovdiv-theatre")]) {
      expect(await loadCityEventPage(id)).toBeNull();
    }
    expect(mocks.load).not.toHaveBeenCalled();
  });
});
