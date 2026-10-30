import "server-only";
import { cache } from "react";
import { CITY_CATEGORY_SOURCES, CITY_SOURCE_POLICY, citySourceInRelease } from "@newspoint/content/city-sources";
import { cityGuideEnabled } from "./access";
import { cityAgenda, type AgendaEvent } from "./event-agenda";
import { cityEventId, cityEventPath, decodeCityEventId, validCityEventId } from "./event-page";
import { loadCityObservations } from "./local-observations";
import { cityContextSourceName } from "./search-context";

export type CityEventPage = {
  id: string; path: string; category: "culture" | "nightlife"; event: AgendaEvent;
  sourceId: string; sourceName: string; checkedAt: string;
};

/** Uses the same publication, source freshness and current-event guards as the public agenda. */
export const loadCityEventPages = cache(async (): Promise<CityEventPage[]> => {
  if (!cityGuideEnabled()) return [];
  const pages = await Promise.all((["culture", "nightlife"] as const).map(async category => {
    const groups = await loadCityObservations(category);
    return cityAgenda(groups, category).flatMap(event => {
      const sourceId = event.id.slice(0, event.id.indexOf(":"));
      const group = groups.find(entry => entry.sourceId === sourceId);
      const sourceName = cityContextSourceName(sourceId);
      const id = cityEventId(event.id);
      if (!group || group.status !== "observed" || !CITY_SOURCE_POLICY[sourceId] || !citySourceInRelease(sourceId)
        || !sourceName || !validCityEventId(id)) return [];
      return [{ id, path: cityEventPath(event.id), category, event, sourceId, sourceName, checkedAt: group.checkedAt }];
    });
  }));
  return pages.flat();
});

export const loadCityEventPage = cache(async (id: string): Promise<CityEventPage | null> => {
  const decoded = decodeCityEventId(id);
  if (!decoded || !cityGuideEnabled()) return null;
  const separator = decoded.indexOf(":"), sourceId = decoded.slice(0, separator);
  const sourceName = cityContextSourceName(sourceId);
  const categories = (["culture", "nightlife"] as const).filter(category => CITY_CATEGORY_SOURCES[category]?.includes(sourceId));
  if (separator < 1 || separator === decoded.length - 1 || !sourceName || !CITY_SOURCE_POLICY[sourceId] || !citySourceInRelease(sourceId) || !categories.length) return null;
  const available = await Promise.all(categories.map(async category => ({ category, groups: await loadCityObservations(category, sourceId, { preserveEmptySources: true }) })));
  for (const { category, groups } of available) {
    const group = groups.find(entry => entry.sourceId === sourceId && entry.status === "observed");
    if (!group) continue;
    const event = cityAgenda([group], category).find(entry => entry.id === decoded);
    if (event) return { id, path: cityEventPath(event.id), category, event, sourceId, sourceName, checkedAt: group.checkedAt };
  }
  // An observed source can establish removal/expiry. A failed snapshot cannot.
  if (available.some(({ groups }) => groups.some(group => group.sourceId === sourceId && group.status === "observed"))) return null;
  throw new Error("City event source temporarily unavailable");
});
