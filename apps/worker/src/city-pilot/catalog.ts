export type CityCategory = "transport" | "parking" | "outages" | "municipality" | "education" | "environment" | "events" | "adoption";
export type SourceFormat = "html" | "map" | "gtfs" | "unknown";

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
  { id: "plovdiv-transit", category: "transport", url: "https://www.plovdiv.bg/item/transport/mass-public-transport/", format: "html" },
  { id: "plovdiv-transport-news", category: "transport", url: "https://www.plovdiv.bg/category/transport/", format: "html" },
  { id: "plovdiv-low-emission", category: "transport", url: "https://www.plovdiv.bg/zona-s-niska-emisia/", format: "html" },
  { id: "baem-plovdiv", category: "transport", url: "https://baem.bg/map/plovdiv", format: "map" },
  { id: "plovdiv-taxis", category: "transport", url: "https://www.plovdiv.bg/item/transport/taxi-companies/", format: "html" },
  // Verified 2026-10-24: feed_info and calendar end on 2022-03-31.
  { id: "plovdiv-gtfs", category: "transport", url: "https://trakia.tech/gtfs/plovdiv.zip", format: "gtfs" },
  { id: "plovdiv-national-transport-catalog", category: "transport", url: "https://sipbg.gov.bg/bgnap/portal/bg/catalog/1bb57544-8bb4-4f77-8d65-5d31ffdee221", format: "html" },
  // The fetched 2026-10-24 ZIP advertises service through 2026-12-31; it is
  // a separate publisher and still needs a seven-day freshness/lifecycle test.
  { id: "plovdiv-livetransport-gtfs", category: "transport", url: "https://gtfs.livetransport.eu/gtfs/plovdiv.zip", format: "gtfs" },
  { id: "openstreetmap", category: "transport", url: "https://www.openstreetmap.org/", format: "map" },
  { id: "plovdiv-parking-rules", category: "parking", url: "https://www.plovdiv.bg/sms-parking/", format: "html" },
  { id: "plovdiv-parking-forms", category: "parking", url: "https://www.plovdiv.bg/administration/municipal-enterprises/op_parking/form/", format: "html" },
  { id: "vik-outages", category: "outages", url: "https://www.vik.bg/bulletin/", format: "html", pilot: true },
  { id: "elyug-unplanned", category: "outages", url: "https://www.elyug.bg/Customers/Unscheduled-power-cuts.aspx", format: "map" },
  { id: "elyug-planned", category: "outages", url: "https://www.elyug.bg/Customers/Planned_shutdowns.aspx", format: "map" },
  { id: "evn-heating", category: "outages", url: "https://www.evn.bg/Home/Heating.aspx", format: "unknown" },
  { id: "plovdiv-services", category: "municipality", url: "https://www.plovdiv.bg/uslugi/administrative-services/", format: "html" },
  { id: "plovdiv-taxes", category: "municipality", url: "https://www.plovdiv.bg/item/taxes/", format: "html" },
  { id: "plovdiv-council", category: "municipality", url: "https://www.plovdiv.bg/общински-съвет/дневен-ред/", format: "html", pilot: true },
  { id: "plovdiv-council-root", category: "municipality", url: "https://plovdiv.bg/obs/", format: "html" },
  { id: "plovdiv-announcements", category: "municipality", url: "https://www.plovdiv.bg/announcements/", format: "html" },
  { id: "plovdiv-auctions", category: "municipality", url: "https://www.plovdiv.bg/announcements/auctions/", format: "html" },
  { id: "plovdiv-registers", category: "municipality", url: "https://www.plovdiv.bg/uslugi/registers/", format: "html" },
  { id: "plovdiv-housing", category: "municipality", url: "https://www.plovdiv.bg/uslugi/administrative-services/housingpolicy/", format: "html" },
  { id: "plovdiv-jobs", category: "municipality", url: "https://www.plovdiv.bg/administration/work-plovdiv-municipality/obyavi/", format: "html" },
  { id: "plovdiv-donations", category: "municipality", url: "https://www.plovdiv.bg/wp-content/uploads/darenia/export_donations_2026.html", format: "html" },
  { id: "plovdiv-social-services", category: "municipality", url: "https://www.plovdiv.bg/wp-content/uploads/2026/10/SotsialniUslugi.html", format: "html" },
  { id: "dz-home", category: "education", url: "https://dz-priem.plovdiv.bg/", format: "html" },
  { id: "dz-vacancies", category: "education", url: "https://dz-priem.plovdiv.bg/vacancies", format: "html", pilot: true },
  { id: "first-grade-admission", category: "education", url: "https://priem.plovdiv.bg/", format: "unknown" },
  { id: "plovdiv-school-jobs", category: "education", url: "https://www.plovdiv.bg/item/education/job-vacancies/", format: "html" },
  { id: "plovdiv-university-events", category: "education", url: "https://uni-plovdiv.bg/events/all/", format: "html" },
  { id: "plovdiv-air", category: "environment", url: "https://www.plovdiv.bg/item/ecology/air/local-air-monitoring-system/", format: "html" },
  { id: "plovdiv-cleaning", category: "environment", url: "https://chistota-plovdiv.com/", format: "unknown" },
  { id: "plovdiv-meteorology", category: "environment", url: "https://www.plovdiv.meteo.bg/foreca.php", format: "html" },
  { id: "plovdiv-ecomap", category: "environment", url: "https://ecomap.plovdiv.bg/", format: "map" },
  { id: "plovdiv-special-waste", category: "environment", url: "https://ecomap.plovdiv.bg/special-waste", format: "map" },
  { id: "plovdiv-ecomonitoring", category: "environment", url: "http://ecomonitoring.plovdiv.bg/plovdiv/", format: "unknown" },
  { id: "plovdiv-theatre", category: "events", url: "https://tickets.dtp.bg/", format: "html", pilot: true },
  { id: "plovdiv-opera", category: "events", url: "https://operaplovdiv.bg/bg/site/program", format: "html", pilot: true },
  { id: "plovdiv-culture", category: "events", url: "https://culture.plovdiv.bg/", format: "html" },
  { id: "plovdiv-events", category: "events", url: "https://www.plovdiv.bg/events/", format: "html" },
  { id: "club-code", category: "events", url: "https://www.clubcode.bg/language/bg/our-events/?filter=all", format: "html" },
  { id: "club-code-upcoming", category: "events", url: "https://www.clubcode.bg/language/bg/our-events/?filter=upcoming", format: "html", pilot: true },
  { id: "articket", category: "events", url: "https://articket.eu/", format: "unknown" },
  { id: "epaygo", category: "events", url: "https://epaygo.bg/events/all", format: "unknown" },
  { id: "epaygo-clubs", category: "events", url: "https://www.epay.bg/v3main/epaygo/party-and-clubs", format: "unknown" },
  { id: "plovdiv-youth-centre", category: "events", url: "https://youthcentre.plovdiv.bg/bg/novini/kategoria/subitiya", format: "html" },
  { id: "studio-extrovert", category: "events", url: "https://events.studioextrovert.com/", format: "unknown" },
  { id: "plovdiv-community-centres", category: "events", url: "https://culture.plovdiv.bg/pb/p/144-читалища", format: "html" },
  { id: "plovdiv-dog-shelter", category: "adoption", url: "https://dogshelter.plovdiv.bg/dogs-for-adoption", format: "html" },
  { id: "plovdiv-markets", category: "municipality", url: "https://www.plovdiv.bg/administration/municipal-enterprises/market/", format: "html" },
];

export const pilotSources = candidateSources.filter((source) => source.pilot);
