import { expect, it } from "vitest";
import { selectCityObservations } from "./local-observations";

it("preserves an empty observed youth source only for explicit lifecycle lookup", () => {
  const now = new Date("2026-10-30T12:00:00Z");
  const source = { checkedAt: now.toISOString(), outcome: "observed" as const, completeness: "complete" as const, limitations: [], items: [] };
  const preview = { version: 1 as const, sources: { "plovdiv-youth-centre": source } };
  expect(selectCityObservations("culture", preview, now)).toEqual([]);
  expect(selectCityObservations("culture", preview, now, true)).toMatchObject([{ sourceId: "plovdiv-youth-centre", status: "observed", items: [] }]);
});

it("distinguishes stale/failed empty event sources from observed-empty sources", () => {
  const now = new Date("2026-10-30T12:00:00Z");
  const source = { checkedAt: "2026-10-29T12:00:00Z", outcome: "observed" as const, completeness: "complete" as const, limitations: [], items: [] };
  expect(selectCityObservations("nightlife", { version: 1, sources: { "epaygo-plovdiv-explicit": source } }, now, true)).toMatchObject([{ status: "stale", items: [] }]);
  expect(selectCityObservations("culture", { version: 1, sources: { "plovdiv-youth-centre": { ...source, outcome: "unavailable" } } }, now, true)).toMatchObject([{ status: "unavailable", items: [] }]);
});
