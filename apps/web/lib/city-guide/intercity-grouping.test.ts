import { describe, expect, it } from "vitest";
import { cityIntercityJourney, cityIntercityJourneyRelevant, cityIntercitySources } from "./intercity";
import { selectCityObservations } from "./local-observations";

type Group = Parameters<typeof cityIntercitySources>[0][number];
type Fields = Record<string, string | number>;
const now = new Date("2026-10-30T11:00:00Z");
const today = "2026-10-30";
const tomorrow = "2026-10-31";

// Explicit QA fixtures, not live journeys. Keep the approved source bindings independent of runtime configuration.
const routes = [
  { sourceId: "karat-plovdiv-sofia", destination: "София", publisher: "Карат-С / Citylines" },
  { sourceId: "union-plovdiv-burgas", destination: "Бургас", publisher: "Юнион Ивкони" },
  { sourceId: "union-plovdiv-varna", destination: "Варна", publisher: "Юнион Ивкони" },
] as const;
function fields(route: typeof routes[number], changes: Fields = {}): Fields {
  return {
    date: today, time: "15:00", arrivalDate: today, arrivalTime: "20:00",
    origin: "Пловдив", destination: route.destination, publisher: route.publisher,
    departureStation: "QA спирка в Пловдив", arrivalStation: `QA спирка в ${route.destination}`, ...changes,
  };
}
function group(route: typeof routes[number], changes: Partial<Group> = {}): Group {
  return {
    sourceId: route.sourceId, checkedAt: now.toISOString(), status: "observed",
    items: [{ key: "qa-shared-course-id", fields: fields(route) }], ...changes,
  };
}
function selected(groups: Group[], at = now) {
  return cityIntercitySources(selectCityObservations("transport", {
    version: 1,
    sources: Object.fromEntries(groups.map(value => [value.sourceId, {
      checkedAt: value.checkedAt, outcome: value.status === "unavailable" ? "unavailable" as const : "observed" as const,
      completeness: "uncertain" as const, limitations: [], items: value.items,
    }])),
  }, at));
}

describe("intercity source grouping", () => {
  it("keeps exactly the three approved destinations visible when observations are missing", () => {
    expect(cityIntercitySources([])).toEqual(routes.map(route => ({
      ...route, checkedAt: null, status: "unavailable", journeys: [],
    })));
    const sources = cityIntercitySources(routes.map(route => group(route)));
    expect(sources.map(({ sourceId, destination, publisher }) => ({ sourceId, destination, publisher }))).toEqual(routes);
    expect(sources.map(source => source.journeys[0]?.destination)).toEqual(["София", "Бургас", "Варна"]);
  });

  it.each(routes)("binds $sourceId to its own publisher and destination", route => {
    expect(cityIntercityJourney(fields(route), route.sourceId)).toMatchObject({ destination: route.destination, publisher: route.publisher });
    for (const other of routes.filter(other => other.sourceId !== route.sourceId)) {
      expect(cityIntercityJourney(fields(other), route.sourceId)).toBeNull();
    }
    expect(cityIntercityJourney(fields(route, { publisher: route.publisher === "Юнион Ивкони" ? "Карат-С / Citylines" : "Юнион Ивкони" }), route.sourceId)).toBeNull();
  });

  it("does not let a Union group insert a Sofia journey or a different Union destination", () => {
    const sources = cityIntercitySources([group(routes[1], { items: [
      { key: "qa-valid-burgas", fields: fields(routes[1]) },
      { key: "qa-forged-sofia", fields: fields(routes[0]) },
      { key: "qa-forged-union-sofia", fields: fields(routes[1], { destination: "София" }) },
      { key: "qa-forged-varna", fields: fields(routes[2]) },
    ] })]);
    expect(sources[0]).toMatchObject({ sourceId: routes[0].sourceId, status: "unavailable", journeys: [] });
    expect(sources[1]?.journeys.map(journey => journey.key)).toEqual(["union-plovdiv-burgas:qa-valid-burgas"]);
    expect(sources[2]?.journeys).toEqual([]);
  });

  it("keeps a working source when another source is stale or failed, preserving each check time", () => {
    const staleAt = "2026-10-30T08:00:00Z";
    const failedAt = "2026-10-30T10:45:00Z";
    const sources = cityIntercitySources([
      group(routes[0]), group(routes[1], { status: "stale", checkedAt: staleAt }),
      group(routes[2], { status: "unavailable", checkedAt: failedAt }),
    ]);
    expect(sources[0]).toMatchObject({ status: "observed", checkedAt: now.toISOString() });
    expect(sources[0]?.journeys).toHaveLength(1);
    expect(sources[1]).toMatchObject({ status: "stale", checkedAt: staleAt, journeys: [] });
    expect(sources[2]).toMatchObject({ status: "unavailable", checkedAt: failedAt, journeys: [] });
    // Exercise the real freshness selector too; retained old items must not leak into the grouped view.
    const result = selected([group(routes[0]), group(routes[1], { checkedAt: staleAt }), group(routes[2], { status: "unavailable", checkedAt: failedAt })]);
    expect(result.map(source => [source.status, source.journeys.length])).toEqual([["observed", 1], ["stale", 0], ["unavailable", 0]]);
  });

  it("ignores unapproved sources even when their fields imitate a valid publisher", () => {
    const approved = group(routes[0]);
    const unapproved = ["qa-unknown-source", "constructor", "__proto__"].map(sourceId => ({ ...group(routes[1]), sourceId }));
    expect(cityIntercitySources([approved, ...unapproved])).toEqual(cityIntercitySources([approved]));
    for (const source of unapproved) expect(cityIntercityJourney(fields(routes[1]), source.sourceId)).toBeNull();
  });

  it("qualifies identical course IDs with their source so different destinations cannot collide", () => {
    const journeys = cityIntercitySources(routes.map(route => group(route))).flatMap(source => source.journeys);
    expect(journeys.map(journey => journey.key)).toEqual([
      "karat-plovdiv-sofia:qa-shared-course-id", "union-plovdiv-burgas:qa-shared-course-id", "union-plovdiv-varna:qa-shared-course-id",
    ]);
    expect(new Set(journeys.map(journey => journey.key)).size).toBe(3);
  });

  it("preserves today's and tomorrow's published dates while rejecting old and calendar-invalid rows", () => {
    const sources = selected(routes.map(route => group(route, { items: [
      { key: "qa-today", fields: fields(route) },
      { key: "qa-tomorrow", fields: fields(route, { date: tomorrow, arrivalDate: tomorrow }) },
      { key: "qa-old", fields: fields(route, { date: "2026-10-29", arrivalDate: "2026-10-29" }) },
      { key: "qa-invalid-calendar", fields: fields(route, { date: "2026-02-30", arrivalDate: "2026-02-30" }) },
      { key: "qa-too-far", fields: fields(route, { date: "2026-11-07", arrivalDate: "2026-11-07" }) },
    ] })));
    for (const source of sources) {
      expect(source.journeys.map(journey => journey.date)).toEqual([today, tomorrow]);
      expect(source.journeys.map(journey => journey.key)).toEqual([`${source.sourceId}:qa-today`, `${source.sourceId}:qa-tomorrow`]);
    }
  });

  it.each([
    { time: "24:00" }, { arrivalTime: "20:60" }, { arrivalDate: "2026-02-30" },
    { arrivalTime: "15:00" }, { arrivalTime: "14:59" }, { arrivalDate: tomorrow, arrivalTime: "15:01" },
    { departureStation: "   " }, { arrivalStation: "" }, { origin: "София" }, { destination: "Хисаря" },
  ])("rejects an invalid journey without discarding its valid sibling: %j", changes => {
    expect(cityIntercityJourney(fields(routes[2], changes), routes[2].sourceId)).toBeNull();
    const sources = cityIntercitySources([group(routes[2], { items: [
      { key: "qa-good", fields: fields(routes[2]) }, { key: "qa-bad", fields: fields(routes[2], changes) },
    ] })]);
    expect(sources[2]?.journeys.map(journey => journey.key)).toEqual(["union-plovdiv-varna:qa-good"]);
  });

  it("accepts a valid overnight journey without changing the departure date", () => {
    const overnight = fields(routes[2], { time: "23:00", arrivalDate: tomorrow, arrivalTime: "05:00" });
    expect(cityIntercityJourney(overnight, routes[2].sourceId)).toMatchObject({ date: today, time: "23:00", arrivalDate: tomorrow, arrivalTime: "05:00" });
    expect(cityIntercityJourneyRelevant(overnight, today, routes[2].sourceId)).toBe(true);
    expect(cityIntercityJourneyRelevant(overnight, tomorrow, routes[2].sourceId)).toBe(false);
  });

  it("expires yesterday's departures at Sofia midnight without dropping the next day's rows", () => {
    const sofiaMidnight = new Date("2026-10-30T22:01:00Z");
    const sources = selected(routes.map(route => group(route, { checkedAt: sofiaMidnight.toISOString(), items: [
      { key: "qa-yesterday-in-sofia", fields: fields(route) },
      { key: "qa-today-in-sofia", fields: fields(route, { date: tomorrow, arrivalDate: tomorrow }) },
    ] })), sofiaMidnight);
    expect(sources.map(source => source.journeys.map(journey => journey.date))).toEqual([[tomorrow], [tomorrow], [tomorrow]]);
  });
});
