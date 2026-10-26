import { expect, it } from "vitest";
import { CITY_PRESENTATION, readerCityGroups } from "./presentation";
import type { CityObservation } from "./local-observations";

const group = (sourceId: string, status: CityObservation["status"] = "observed"): CityObservation => ({ sourceId, checkedAt: "2026-10-26T07:00:00Z", status, completeness: "uncertain", items: [{ key: "one", fields: {} }] });

it("puts useful deadlines before reference contacts and never promotes empty docket evidence", () => {
  const groups = readerCityGroups([group("plovdiv-contacts"), group("plovdiv-council"), group("plovdiv-management-competitions"), group("plovdiv-tax-notices"), group("plovdiv-housing", "stale")]);
  expect(groups.map(entry => entry.sourceId)).toEqual([]);
  expect(CITY_PRESENTATION["plovdiv-contacts"]?.utility).toBe(true);
  expect(readerCityGroups([{ ...group("plovdiv-tax-notices"), items: [] }])).toEqual([]);
});
