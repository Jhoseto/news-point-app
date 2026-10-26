import { expect, it } from "vitest";
import { CITY_SOURCE_POLICY, citySourceInRelease } from "./city-sources";
import { cityCollectionHealth } from "./city-health";
it("excludes deferred municipal work and detects failure, staleness and stopped schedules", () => {
  const now = new Date("2026-10-26T12:00:00Z");
  const state = Object.fromEntries(Object.keys(CITY_SOURCE_POLICY).map(id => [id, { lastSuccessAt: now.toISOString(), nextDueAt: "2026-10-26T13:00:00Z", failures: 0 }]));
  const healthy = cityCollectionHealth(state, now);
  expect(healthy.status).toBe("ok");
  expect(healthy.expectedSources).toBe(Object.keys(state).filter(citySourceInRelease).length);
  expect(healthy.sources.some(source => source.id === "plovdiv-council")).toBe(false);
  state["vik-outages"]!.nextDueAt = "2026-10-26T11:00:00Z";
  state["plovdiv-opera"]!.lastSuccessAt = "2026-10-24T11:00:00Z";
  state["dz-vacancies"]!.failures = 1;
  const status = Object.fromEntries(cityCollectionHealth(state, now).sources.map(source => [source.id, source.status]));
  expect(status["vik-outages"]).toBe("overdue"); expect(status["plovdiv-opera"]).toBe("stale"); expect(status["dz-vacancies"]).toBe("failed");
  expect(cityCollectionHealth({}, now).status).toBe("degraded");
});
