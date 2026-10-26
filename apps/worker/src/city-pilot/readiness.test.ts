import { expect, it } from "vitest";
import { CITY_CATEGORY_SOURCES, CITY_SOURCE_POLICY } from "@newspoint/content/city-sources";
import { pilotSources } from "./catalog";
import { cityReadiness } from "./readiness";

it("gives every collected and reader source an explicit daily-or-faster schedule and later expiry", () => {
  expect(Object.keys(CITY_SOURCE_POLICY).sort()).toEqual(pilotSources.map(source => source.id).sort());
  for (const id of Object.values(CITY_CATEGORY_SOURCES).flat()) expect(CITY_SOURCE_POLICY[id]).toBeDefined();
  for (const policy of Object.values(CITY_SOURCE_POLICY)) {
    expect(policy.refreshSeconds).toBeGreaterThanOrEqual(300);
    expect(policy.refreshSeconds).toBeLessThanOrEqual(86400);
    expect(policy.staleSeconds).toBeGreaterThan(policy.refreshSeconds);
  }
});
it("distinguishes an overdue collector, a backed-off failure, stale data and a healthy scheduled source", () => {
  const now = new Date("2026-10-26T10:00:00Z");
  const checkedAt = "2026-10-26T09:55:00Z";
  const state = { lastCheckedAt: checkedAt, lastSuccessAt: checkedAt, nextDueAt: "2026-10-26T11:00:00Z", failures: 0 };
  const snap = { checkedAt, outcome: "observed", items: [] };
  const report = cityReadiness({ "vik-outages": { ...state, nextDueAt: "2026-10-26T09:40:00Z" }, "evn-heating-outages": { ...state, failures: 1 }, "plovdiv-transit": state, "dz-vacancies": state },
    { "vik-outages": snap, "evn-heating-outages": snap, "plovdiv-transit": snap, "dz-vacancies": { ...snap, checkedAt: "2026-10-24T09:00:00Z" } }, now);
  const status = Object.fromEntries(report.sources.map(source => [source.id, source.status]));
  expect(status["vik-outages"]).toBe("overdue");
  expect(status["evn-heating-outages"]).toBe("unavailable");
  expect(status["plovdiv-transit"]).toBe("healthy");
  expect(status["dz-vacancies"]).toBe("stale");
  expect(status["plovdiv-council"]).toBe("never-checked");
  expect(report.categories.find(category => category.slug === "outages")?.topics.find(topic => topic.title === "Без ток")?.status).toBe("not-implemented");
});
