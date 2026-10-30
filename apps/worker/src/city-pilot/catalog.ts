import { LOHI_URL } from "./lohi-programme";
import { PARKING_VENUES } from "./parking-venues";
import { VENUE_PROGRAMMES } from "./venue-programmes";
import { PLOVDIV_AIR_URL } from "./air-quality";
export type CityCategory = "transport" | "parking" | "outages" | "municipality" | "education" | "environment" | "events" | "adoption";
export type SourceFormat = "html" | "json" | "map" | "gtfs" | "ical" | "pdf" | "unknown";

export type CandidateSource = {
  id: string;
  category: CityCategory;
  url: string;
  format: SourceFormat;
  pilot?: true;
};

// Inventory from the two 2026-10-24 concept documents plus explicitly probed
// alternatives. A URL here is not evidence of approved extraction or freshness.
export const candidateSources: CandidateSource[] = [
  { id: "balbok-plovdiv-campaigns", category: "environment", url: "https://www.balbok.com/bg/news", format: "html", pilot: true },
  { id: "vivacom-plovdiv-parking", category: "parking", url: "https://www.vivacom.bg/dopalnitelni-uslugi/zabavlenie/sms-parkirane", format: "html", pilot: true },
  { id: "lohi-programme", category: "events", url: LOHI_URL, format: "html", pilot: true },
  ...Object.entries(PARKING_VENUES).map(([id, config]) => ({ id, category: "parking" as const, url: config.url, format: "html" as const, pilot: true as const })),
  { id: "plovdiv-community-air", category: "environment", url: PLOVDIV_AIR_URL, format: "json", pilot: true },
  { id: "ecopack-containers", category: "environment", url: "https://map.ecopack.bg/api/locations/geojson", format: "json", pilot: true },
  { id: "plovdiv-transit", category: "transport", url: "https://www.plovdiv.bg/item/transport/mass-public-transport/", format: "html", pilot: true },
  { id: "plovdiv-transport-news", category: "transport", url: "https://www.plovdiv.bg/category/transport/", format: "html" },
  { id: "plovdiv-low-emission-permit", category: "transport", url: "https://www.plovdiv.bg/administration/municipal-enterprises/op_parking/form/", format: "html", pilot: true },
  { id: "plovdiv-low-emission", category: "transport", url: "https://www.plovdiv.bg/zona-s-niska-emisia/", format: "html", pilot: true },
  { id: "baem-plovdiv", category: "transport", url: "https://baem.bg/map/plovdiv", format: "map" },
  { id: "plovdiv-taxis", category: "transport", url: "https://www.plovdiv.bg/item/transport/taxi-companies/", format: "html" },
  { id: "plovdiv-airport-flights", category: "transport", url: "https://www.plovdivairport.com/poleti/razpisanie", format: "html", pilot: true },
  { id: "bdz-plovdiv-station", category: "transport", url: "https://www.bdz.bg/bg/a/gari", format: "html" },
  // Linked scheme is a 2022 PDF, not a live closure map; unsuitable for current road status.
  { id: "plovdiv-traffic-works-map", category: "transport", url: "https://www.plovdiv.bg/shema-remontni-deynosti/", format: "pdf" },
  // The municipal article currently links a 52-page October–December 2026 permit PDF.
  // Row extraction, update URL, privacy and expiry are not yet validated.
  { id: "plovdiv-taxi-permits", category: "transport", url: "https://www.plovdiv.bg/wp-content/uploads/2026/10/license_taxi(10.2026.pdf", format: "pdf" },
  // Verified 2026-10-24: feed_info and calendar end on 2022-03-31.
  { id: "plovdiv-gtfs", category: "transport", url: "https://trakia.tech/gtfs/plovdiv.zip", format: "gtfs" },
  { id: "plovdiv-national-transport-catalog", category: "transport", url: "https://sipbg.gov.bg/bgnap/portal/bg/catalog/1bb57544-8bb4-4f77-8d65-5d31ffdee221", format: "html" },
  // The fetched 2026-10-25 ZIP advertises service through 2026-12-31, but its
  // calendar covers weekends only; day-specific checks and a seven-day test remain.
  { id: "plovdiv-livetransport-gtfs", category: "transport", url: "https://gtfs.livetransport.eu/gtfs/plovdiv.zip", format: "gtfs", pilot: true },
  { id: "plovdiv-transit-documents", category: "transport", url: "https://www.plovdiv.bg/item/transport/mass-public-transport/", format: "html", pilot: true },
  { id: "karat-plovdiv-sofia", category: "transport", url: "https://karat-s.com/bus/plovdiv-sofia", format: "html", pilot: true },
  { id: "union-plovdiv-burgas", category: "transport", url: "https://union-ivkoni.com/bg/routes", format: "html", pilot: true },
  { id: "union-plovdiv-varna", category: "transport", url: "https://union-ivkoni.com/bg/routes", format: "html", pilot: true },
  { id: "openstreetmap", category: "transport", url: "https://www.openstreetmap.org/", format: "map" },
  { id: "plovdiv-parking-rules", category: "parking", url: "https://www.plovdiv.bg/sms-parking/", format: "html", pilot: true },
  { id: "plovdiv-parking-operator", category: "parking", url: "https://www.plovdiv.bg/administration/municipal-enterprises/op_parking/", format: "html", pilot: true },
  { id: "plovdiv-parking-forms", category: "parking", url: "https://www.plovdiv.bg/administration/municipal-enterprises/op_parking/form/", format: "html" },
  { id: "vik-outages", category: "outages", url: "https://www.vik.bg/bulletin/", format: "html", pilot: true },
  { id: "elyug-unplanned", category: "outages", url: "https://www.elyug.bg/Customers/Unscheduled-power-cuts.aspx", format: "map" },
  { id: "elyug-planned", category: "outages", url: "https://www.elyug.bg/Customers/Planned_shutdowns.aspx", format: "map" },
  // Region is Plovdiv province, not necessarily Plovdiv city; no city row on 2026-10-25.
  { id: "elyug-planned-plovdiv-region", category: "outages", url: "https://www.elyug.bg/oldservices/ec_ep/abschaltung_bg/abschaltung4.asp", format: "html", pilot: true },
  { id: "evn-heating-outages", category: "outages", url: "https://www.evn.bg/Home/Heating.aspx", format: "html", pilot: true },
  { id: "plovdiv-services", category: "municipality", url: "https://www.plovdiv.bg/uslugi/administrative-services/", format: "html" },
  { id: "plovdiv-transport-signals", category: "municipality", url: "https://www.plovdiv.bg/administration/municipal-enterprises/transport/", format: "html", pilot: true },
  { id: "plovdiv-taxes", category: "municipality", url: "https://www.plovdiv.bg/item/taxes/", format: "html", pilot: true },
  // Historical one-year article is superseded by the maintained notice listing.
  { id: "plovdiv-taxes-2026", category: "municipality", url: "https://www.plovdiv.bg/plashtame-s-5-otstapka-danak-imoti-i-tbo-ako-vnesem-tsyalata-suma-do-kraya-na-april/", format: "html" },
  { id: "plovdiv-tax-notices", category: "municipality", url: "https://www.plovdiv.bg/item/taxes/mdt-messages/", format: "html", pilot: true },
  { id: "plovdiv-council", category: "municipality", url: "https://www.plovdiv.bg/общински-съвет/дневен-ред/", format: "html", pilot: true },
  { id: "plovdiv-council-root", category: "municipality", url: "https://plovdiv.bg/obs/", format: "html" },
  { id: "plovdiv-announcements", category: "municipality", url: "https://www.plovdiv.bg/announcements/", format: "html" },
  { id: "plovdiv-public-consultations", category: "municipality", url: "https://www.plovdiv.bg/announcements/pna/", format: "html", pilot: true },
  { id: "plovdiv-management-competitions", category: "municipality", url: "https://www.plovdiv.bg/announcements/messages/konkursi/", format: "html", pilot: true },
  { id: "plovdiv-auctions", category: "municipality", url: "https://www.plovdiv.bg/announcements/auctions/", format: "html" },
  { id: "plovdiv-registers", category: "municipality", url: "https://www.plovdiv.bg/uslugi/registers/", format: "html" },
  { id: "plovdiv-housing", category: "municipality", url: "https://www.plovdiv.bg/uslugi/administrative-services/housingpolicy/", format: "html", pilot: true },
  { id: "plovdiv-jobs", category: "municipality", url: "https://www.plovdiv.bg/administration/work-plovdiv-municipality/obyavi/", format: "html" },
  { id: "plovdiv-careers", category: "municipality", url: "https://www.plovdiv.bg/category/careers/", format: "html" },
  { id: "plovdiv-contacts", category: "municipality", url: "https://www.plovdiv.bg/fmenu/contacts/", format: "html", pilot: true },
  { id: "plovdiv-budget-2026", category: "municipality", url: "https://www.plovdiv.bg/item/budget-and-finance/budget/", format: "html" },
  { id: "plovdiv-election-2026", category: "municipality", url: "https://www.plovdiv.bg/announcements/pvr-2026/", format: "html" },
  { id: "plovdiv-auction-list", category: "municipality", url: "https://www.plovdiv.bg/announcements/auctions/turgove/", format: "html", pilot: true },
  { id: "plovdiv-donations", category: "municipality", url: "https://www.plovdiv.bg/wp-content/uploads/darenia/export_donations_2026.html", format: "html" },
  { id: "plovdiv-social-services", category: "municipality", url: "https://www.plovdiv.bg/wp-content/uploads/2026/10/SotsialniUslugi.html", format: "html", pilot: true },
  { id: "dz-admission-calendar", category: "education", url: "https://dz-priem.plovdiv.bg/user_guide", format: "html", pilot: true },
  { id: "dz-home", category: "education", url: "https://dz-priem.plovdiv.bg/", format: "html" },
  { id: "dz-vacancies", category: "education", url: "https://dz-priem.plovdiv.bg/vacancies", format: "html", pilot: true },
  // One public page has six district tables and 88 individually identified sites.
  { id: "dz-institutions", category: "education", url: "https://dz-priem.plovdiv.bg/schools", format: "html", pilot: true },
  { id: "first-grade-admission", category: "education", url: "https://priem.plovdiv.bg/", format: "html" },
  // Public GET district/type filters partition the 2026/27 third-ranking 23 schools.
  { id: "first-grade-vacancies", category: "education", url: "https://priem.plovdiv.bg/vacancies", format: "html", pilot: true },
  // Municipal directory has 52 four-column rows in six school types on 2026-10-25.
  // Publication date and the currency of its contacts are not stated.
  { id: "plovdiv-municipal-schools", category: "education", url: "https://www.plovdiv.bg/item/education/secondary-education/schools/municipal-schools/", format: "html", pilot: true },
  { id: "plovdiv-school-jobs", category: "education", url: "https://www.plovdiv.bg/item/education/job-vacancies/", format: "html" },
  { id: "plovdiv-university-events", category: "education", url: "https://uni-plovdiv.bg/events/all/", format: "html" },
  { id: "plovdiv-air", category: "environment", url: "https://www.plovdiv.bg/item/ecology/air/local-air-monitoring-system/", format: "html" },
  { id: "plovdiv-eco-bulletin", category: "environment", url: "https://www.plovdiv.bg/item/ecology/eco_bulletin/", format: "html" },
  { id: "eea-air-live", category: "environment", url: "https://eca.government.bg/kav/", format: "unknown" },
  { id: "eea-air-kav", category: "environment", url: "https://www.eea.government.bg/kav/", format: "html" },
  { id: "eea-air-daily-bulletin", category: "environment", url: "https://pdbase.eea.government.bg/airq/", format: "html" },
  { id: "plovdiv-cleaning", category: "environment", url: "https://chistota-plovdiv.com/", format: "unknown" },
  { id: "chistota-bulky-waste", category: "environment", url: "https://chistota-plovdiv.com/пловдивчани-изхвърлят-едрогабаритни/", format: "html", pilot: true },
  { id: "plovdiv-meteorology", category: "environment", url: "https://www.plovdiv.meteo.bg/foreca.php", format: "html" },
  { id: "nimh-river-runoff", category: "environment", url: "https://info.meteo.bg/openData/river-runoff/", format: "unknown" },
  { id: "plovdiv-noise-map", category: "environment", url: "https://www.plovdiv.bg/item/ecology/noise/strategic-noice-map/", format: "pdf" },
  { id: "plovdiv-ecomap", category: "environment", url: "https://ecomap.plovdiv.bg/", format: "map" },
  { id: "plovdiv-eco-signals", category: "environment", url: "https://www.plovdiv.bg/item/ecology/signals/", format: "html", pilot: true },
  { id: "plovdiv-tick-spraying", category: "environment", url: "https://www.plovdiv.bg/praskat-sreshtu-karlezhi-v-plovdiv/", format: "html" },
  // Public Leaflet endpoint, city bounds verified against two half-city queries.
  { id: "ecomap-containers", category: "environment", url: "https://ecomap.plovdiv.bg/api/containers?bounds%5Bnorth%5D=42.23&bounds%5Bsouth%5D=42.07&bounds%5Beast%5D=24.91&bounds%5Bwest%5D=24.58", format: "json", pilot: true },
  { id: "ecomap-collection-events", category: "environment", url: "https://ecomap.plovdiv.bg/api/events", format: "json", pilot: true },
  { id: "plovdiv-special-waste", category: "environment", url: "https://ecomap.plovdiv.bg/special-waste", format: "map" },
  { id: "plovdiv-ecomonitoring", category: "environment", url: "http://ecomonitoring.plovdiv.bg/plovdiv/", format: "unknown" },
  { id: "plovdiv-air-chart-kamenitsa", category: "environment", url: "https://monitoring.deltanetbg.com/chart2.php", format: "html" },
  { id: "plovdiv-air-chart-trakia", category: "environment", url: "https://monitoring.deltanetbg.com/chart3.php", format: "html" },
  { id: "plovdiv-theatre", category: "events", url: "https://tickets.dtp.bg/", format: "html", pilot: true },
  { id: "plovdiv-opera", category: "events", url: "https://operaplovdiv.bg/bg/site/program", format: "html", pilot: true },
  { id: "plovdiv-culture", category: "events", url: "https://culture.plovdiv.bg/", format: "html" },
  { id: "plovdiv-events", category: "events", url: "https://www.plovdiv.bg/events/", format: "html" },
  // Checked 2026-10-25: the linked feed has 101 VEVENTs, all dated 2012–2014.
  { id: "plovdiv-events-ical", category: "events", url: "https://www.plovdiv.bg/?ical", format: "ical" },
  { id: "club-code", category: "events", url: "https://www.clubcode.bg/language/bg/our-events/?filter=all", format: "html" },
  { id: "club-code-upcoming", category: "events", url: "https://www.clubcode.bg/language/bg/our-events/?filter=upcoming", format: "html", pilot: true },
  { id: "articket", category: "events", url: "https://articket.eu/", format: "unknown" },
  { id: "epaygo", category: "events", url: "https://epaygo.bg/events/all", format: "unknown" },
  // Narrow pilot: only titles naming Plovdiv, then verify the event detail address.
  { id: "epaygo-plovdiv-explicit", category: "events", url: "https://epaygo.bg/events/all", format: "html", pilot: true },
  { id: "epaygo-clubs", category: "events", url: "https://www.epay.bg/v3main/epaygo/party-and-clubs", format: "unknown" },
  { id: "plovdiv-youth-centre", category: "events", url: "https://youthcentre.plovdiv.bg/bg/novini/kategoria/subitiya", format: "html", pilot: true },
  { id: "studio-extrovert", category: "events", url: "https://events.studioextrovert.com/", format: "unknown" },
  { id: "plovdiv-community-centres", category: "events", url: "https://culture.plovdiv.bg/pb/p/144-читалища", format: "html" },
  { id: "plovdiv-gallery-current", category: "events", url: "https://galleryplovdiv.com/bg/vremenni-ekspozitsii/tekushti-izlojbi", format: "html", pilot: true },
  { id: "plovdiv-live-club-events", category: "events", url: "https://liveclubplovdiv.com/events.html", format: "html" },
  { id: "plovdiv-dog-shelter", category: "adoption", url: "https://dogshelter.plovdiv.bg/dogs-for-adoption", format: "html", pilot: true },
  { id: "plovdiv-adoption-guide", category: "adoption", url: "https://dogshelter.plovdiv.bg/", format: "html", pilot: true },
  // The municipal page provides operator contact, but its linked former operator
  // domain redirects to an unrelated news site; no verified market directory.
  { id: "plovdiv-markets", category: "municipality", url: "https://www.plovdiv.bg/administration/municipal-enterprises/market/", format: "html" },
];

// Separate venue feeds keep a failure at one programme from hiding other venues.
for (const [id, config] of Object.entries(VENUE_PROGRAMMES)) {
  const existing = candidateSources.find(source => source.id === id);
  if (existing) existing.pilot = true;
  else candidateSources.push({ id, category: "events", url: config.url, format: "html", pilot: true });
}
export const pilotSources = candidateSources.filter((source) => source.pilot);
