import "server-only";
import { cache } from "react";
import { CITY_CATEGORIES } from "./catalog";
import { cityGuideEnabled } from "./access";
import { loadCityObservations } from "./local-observations";
import { CITY_HOME_SEO, cityHasSearchContent, citySeoPage } from "./seo";
import { publicIndexingEnabled } from "../indexing-policy.mjs";

export function citySearchPublished() { return cityGuideEnabled() && publicIndexingEnabled(); }

export const loadCitySearchState = cache(async () => {
  if (!cityGuideEnabled()) return [];
  return Promise.all(CITY_CATEGORIES.map(async category => {
    const groups = await loadCityObservations(category.slug);
    return { slug: category.slug, groups, hasContent: cityHasSearchContent(category.slug, groups) };
  }));
});

export async function cityDiscoveryPages() {
  if (!citySearchPublished()) return [];
  const state = await loadCitySearchState();
  return [CITY_HOME_SEO, ...state.filter(entry => entry.hasContent).flatMap(entry => {
    const page = citySeoPage(entry.slug); return page ? [page] : [];
  })];
}
