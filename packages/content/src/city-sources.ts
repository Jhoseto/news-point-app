/** One explicit collection and expiry policy shared by the collector and reader. Seconds. */
// Temporarily deferred by Koce: municipal administration, procedures and permits.
// Keep collection evidence and implementations so this scope can be resumed later.
export const CITY_DEFERRED_CATEGORIES = ["municipality"];
export const CITY_DEFERRED_SOURCES = new Set([
  "plovdiv-management-competitions", "plovdiv-public-consultations", "plovdiv-auction-list",
  "plovdiv-tax-notices", "plovdiv-taxes", "plovdiv-housing", "plovdiv-contacts",
  "plovdiv-social-services", "plovdiv-council", "plovdiv-transport-signals", "plovdiv-low-emission-permit",
]);
export const citySourceInRelease = (id: string) => !CITY_DEFERRED_SOURCES.has(id);

export const CITY_SOURCE_POLICY: Record<string, { refreshSeconds: number; staleSeconds: number }> = {
  "plovdiv-transit": { refreshSeconds: 86400, staleSeconds: 108000 },
  "plovdiv-livetransport-gtfs": { refreshSeconds: 21600, staleSeconds: 28800 },
  "plovdiv-airport-flights": { refreshSeconds: 3600, staleSeconds: 5400 },
  "plovdiv-low-emission-permit": { refreshSeconds: 86400, staleSeconds: 108000 },
  "plovdiv-low-emission": { refreshSeconds: 86400, staleSeconds: 108000 },
  "vik-outages": { refreshSeconds: 3600, staleSeconds: 7200 },
  "evn-heating-outages": { refreshSeconds: 3600, staleSeconds: 7200 },
  "plovdiv-parking-rules": { refreshSeconds: 86400, staleSeconds: 108000 },
  "plovdiv-parking-operator": { refreshSeconds: 86400, staleSeconds: 108000 },
  "plovdiv-council": { refreshSeconds: 86400, staleSeconds: 108000 },
  "dz-vacancies": { refreshSeconds: 21600, staleSeconds: 28800 },
  "dz-admission-calendar": { refreshSeconds: 86400, staleSeconds: 108000 },
  "dz-institutions": { refreshSeconds: 86400, staleSeconds: 108000 },
  "first-grade-vacancies": { refreshSeconds: 86400, staleSeconds: 108000 },
  "plovdiv-municipal-schools": { refreshSeconds: 86400, staleSeconds: 108000 },
  "plovdiv-social-services": { refreshSeconds: 86400, staleSeconds: 108000 },
  "plovdiv-contacts": { refreshSeconds: 86400, staleSeconds: 108000 },
  "plovdiv-tax-notices": { refreshSeconds: 86400, staleSeconds: 108000 },
  "plovdiv-auction-list": { refreshSeconds: 86400, staleSeconds: 108000 },
  "plovdiv-housing": { refreshSeconds: 86400, staleSeconds: 108000 },
  "plovdiv-public-consultations": { refreshSeconds: 86400, staleSeconds: 108000 },
  "plovdiv-management-competitions": { refreshSeconds: 86400, staleSeconds: 108000 },
  "plovdiv-taxes": { refreshSeconds: 86400, staleSeconds: 108000 },
  "chistota-bulky-waste": { refreshSeconds: 86400, staleSeconds: 108000 },
  "ecomap-containers": { refreshSeconds: 86400, staleSeconds: 108000 },
  "ecomap-collection-events": { refreshSeconds: 86400, staleSeconds: 108000 },
  "plovdiv-eco-signals": { refreshSeconds: 86400, staleSeconds: 108000 },
  "plovdiv-transport-signals": { refreshSeconds: 86400, staleSeconds: 108000 },
  "plovdiv-theatre": { refreshSeconds: 21600, staleSeconds: 28800 },
  "plovdiv-opera": { refreshSeconds: 21600, staleSeconds: 28800 },
  "plovdiv-gallery-current": { refreshSeconds: 21600, staleSeconds: 28800 },
  "club-code-upcoming": { refreshSeconds: 21600, staleSeconds: 28800 },
  "plovdiv-youth-centre": { refreshSeconds: 21600, staleSeconds: 28800 },
  "epaygo-plovdiv-explicit": { refreshSeconds: 21600, staleSeconds: 28800 },
  "plovdiv-dog-shelter": { refreshSeconds: 86400, staleSeconds: 108000 },
  "plovdiv-adoption-guide": { refreshSeconds: 86400, staleSeconds: 108000 },
  "bilet-beebop": { refreshSeconds: 21600, staleSeconds: 28800 },
  "bilet-download": { refreshSeconds: 21600, staleSeconds: 28800 },
  "bilet-plovdiv-event-center": { refreshSeconds: 21600, staleSeconds: 28800 },
  "bilet-colodrome": { refreshSeconds: 21600, staleSeconds: 28800 },
  "bilet-elum": { refreshSeconds: 21600, staleSeconds: 28800 },
  "bushido-programme": { refreshSeconds: 21600, staleSeconds: 28800 },
  "plovdiv-live-club-events": { refreshSeconds: 21600, staleSeconds: 28800 },
};

export const CITY_CATEGORY_SOURCES: Record<string, readonly string[]> = {
  transport: ["plovdiv-livetransport-gtfs", "plovdiv-airport-flights", "plovdiv-low-emission", "plovdiv-low-emission-permit", "plovdiv-transit"],
  parking: ["plovdiv-parking-rules", "plovdiv-parking-operator"],
  outages: ["vik-outages", "evn-heating-outages"],
  municipality: ["plovdiv-management-competitions", "plovdiv-public-consultations", "plovdiv-auction-list", "plovdiv-tax-notices", "plovdiv-taxes", "plovdiv-housing", "plovdiv-contacts", "plovdiv-social-services", "plovdiv-eco-signals", "plovdiv-transport-signals", "plovdiv-council"],
  education: ["dz-admission-calendar", "first-grade-vacancies", "dz-vacancies", "plovdiv-municipal-schools", "dz-institutions"],
  environment: ["chistota-bulky-waste", "ecomap-collection-events", "ecomap-containers", "plovdiv-eco-signals"],
  culture: ["plovdiv-theatre", "plovdiv-opera", "plovdiv-gallery-current", "plovdiv-youth-centre", "epaygo-plovdiv-explicit"],
  nightlife: ["club-code-upcoming", "epaygo-plovdiv-explicit", "bilet-beebop", "bilet-download", "bilet-plovdiv-event-center", "bilet-colodrome", "bilet-elum", "bushido-programme", "plovdiv-live-club-events"],
  adopt: ["plovdiv-adoption-guide", "plovdiv-dog-shelter"],
};

export function citySourcePolicy(id: string) {
  const policy = CITY_SOURCE_POLICY[id];
  if (!policy) throw new Error(`Missing city refresh policy: ${id}`);
  return policy;
}
