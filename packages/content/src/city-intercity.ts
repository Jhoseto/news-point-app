/** Only routes whose public source contract has been checked. No reader-supplied destinations. */
export const CITY_INTERCITY_ROUTES = {
  "karat-plovdiv-sofia": { destination: "София", publisher: "Карат-С / Citylines" },
  "union-plovdiv-burgas": { destination: "Бургас", publisher: "Юнион Ивкони" },
  "union-plovdiv-varna": { destination: "Варна", publisher: "Юнион Ивкони" },
} as const;

export type CityIntercitySourceId = keyof typeof CITY_INTERCITY_ROUTES;
export function cityIntercityRoute(sourceId: string) {
  return Object.hasOwn(CITY_INTERCITY_ROUTES, sourceId) ? CITY_INTERCITY_ROUTES[sourceId as CityIntercitySourceId] : null;
}
