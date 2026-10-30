import { cityGuideEnabled } from "./access";
import { CITY_CATEGORY_SOURCES, CITY_SOURCE_POLICY, CITY_DEFERRED_CATEGORIES, citySourceInRelease } from "@newspoint/content/city-sources";
import "server-only";
import { NIGHT_PROGRAMME_SOURCES, programmeKind } from "./night-programmes";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { cache } from "react";
import { z } from "zod";
import { readCitySnapshots } from "@newspoint/db/city";
import { explicitNightEventKind } from "./event-kind";
import { cityIntercityJourneyRelevant } from "./intercity";
import { cityTransitDocument } from "./transit-documents";
import { cityIntercityRoute } from "@newspoint/content/city-intercity";

const itemSchema = z.object({
  key: z.string().min(1),
  fields: z.record(z.string(), z.union([z.string(), z.number()])),
});
const sourceSchema = z.object({
  checkedAt: z.string().datetime(),
  outcome: z.enum(["observed", "unavailable"]),
  completeness: z.enum(["complete", "uncertain"]),
  limitations: z.array(z.string()),
  items: z.array(itemSchema).max(2500),
});
const previewSchema = z.object({ version: z.literal(1), sources: z.record(z.string(), sourceSchema) });

const CATEGORY_SOURCES = CITY_CATEGORY_SOURCES;

const FRESH_MS = Object.fromEntries(Object.entries(CITY_SOURCE_POLICY).map(([id, policy]) => [id, policy.staleSeconds * 1000]));

const PLOVDIV_OPERA_VENUES = new Set([
  "Античен театър",
  'Дом на културата "Борис Христов"',
  "Епископската базилика на Филипопол",
]);

export type CityObservation = {
  sourceId: string;
  checkedAt: string;
  status: "observed" | "unavailable" | "stale";
  completeness: "complete" | "uncertain";
  items: { key: string; fields: Record<string, string | number> }[];
};

function localDay(date: Date): string {
  return date.toLocaleDateString("sv-SE", { timeZone: "Europe/Sofia" });
}

function isRelevantRow(sourceId: string, fields: Record<string, string | number>, today: string, now: Date): boolean {
  if (cityIntercityRoute(sourceId)) return cityIntercityJourneyRelevant(fields, today, sourceId);
  if (sourceId === "plovdiv-transit-documents") {
    const document = cityTransitDocument(fields);
    return !!document && document.validFrom <= today && document.validThrough >= today;
  }
  if (sourceId === "balbok-plovdiv-campaigns") {
    const date = String(fields.date ?? ""), parsed = new Date(`${date}T12:00:00Z`);
    const clock = now.toLocaleTimeString("en-GB", { timeZone: "Europe/Sofia", hourCycle: "h23", hour: "2-digit", minute: "2-digit" });
    return ["title", "address", "accepted"].every(key => typeof fields[key] === "string" && String(fields[key]).trim().length > 0)
      && /гр\.?\s*Пловдив/iu.test(String(fields.address)) && /^20\d{2}-\d{2}-\d{2}$/u.test(date) && Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date
      && [fields.startTime, fields.endTime].every(t => /^(?:[01]\d|2[0-3]):[0-5]\d$/u.test(String(t))) && String(fields.startTime) < String(fields.endTime)
      && ["scheduled", "cancelled", "postponed"].includes(String(fields.status)) && (date > today || date === today && String(fields.endTime) > clock);
  }
  if (sourceId === "vivacom-plovdiv-parking") return ["label", "value", "detail"].every(key => typeof fields[key] === "string" && String(fields[key]).trim().length > 0)
    && (fields.price === undefined || typeof fields.price === "number" && fields.price > 0 && fields.price <= 20 && fields.currency === "EUR");
  if (["mall-plovdiv-parking", "markovo-tepe-parking"].includes(sourceId)) return typeof fields.title === "string" && typeof fields.address === "string" && fields.address.includes("Пловдив")
    && fields.currency === "EUR" && typeof fields.hourPrice === "number" && fields.hourPrice > 0 && fields.hourPrice <= 100
    && typeof fields.freeHours === "number" && fields.freeHours >= 0 && fields.freeHours <= 24
    && typeof fields.exitMinutes === "number" && fields.exitMinutes > 0 && fields.exitMinutes <= 60
    && [fields.opens, fields.closes].every(v => typeof v === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/u.test(v));
  if (sourceId === "elyug-planned-plovdiv-region") {
    const dates = [fields.startDate, fields.endDate];
    const time = now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Europe/Sofia" });
    return typeof fields.address === "string" && /(?:гр\.?|град)\s*пловдив(?:[^\p{L}]|$)/iu.test(fields.address)
      && dates.every(value => typeof value === "string" && /^20\d{2}-\d{2}-\d{2}$/u.test(value) && Number.isFinite(Date.parse(`${value}T12:00:00Z`)) && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value)
      && [fields.startTime, fields.endTime].every(value => typeof value === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/u.test(value))
      && String(fields.endDate) >= String(fields.startDate) && (String(fields.endDate) > today || fields.endDate === today && String(fields.endTime) > time);
  }
  if (sourceId === "plovdiv-community-air") {
    const age = now.getTime() - Date.parse(String(fields.measuredAt));
    return typeof fields.sensorId === "string" && /^\d+$/u.test(fields.sensorId) && Number.isFinite(age) && age >= 0 && age <= 20 * 60_000
      && [fields.pm10, fields.pm25].every(value => typeof value === "number" && Number.isFinite(value) && value >= 0)
      && Number(fields.pm10) < 1000 && Number(fields.pm25) < 500;
  }
  if (sourceId === "plovdiv-low-emission-permit") return ["title", "eligibility", "requiredDocuments", "validity", "changes", "submission", "documents"].every(key => typeof fields[key] === "string" && String(fields[key]).length > 10);
  if (sourceId === "dz-admission-calendar") return typeof fields.title === "string" && fields.year === today.slice(0, 4)
    && ["vacanciesDate", "inPersonDeadline", "onlineDeadline", "resultsDate", "enrollmentDeadline", "registrationDate"].every((key, index, keys) => {
      const value = fields[key];
      return typeof value === "string" && /^20\d{2}-\d{2}-\d{2}$/u.test(value) && value.startsWith(`${fields.year}-`)
        && Number.isFinite(Date.parse(`${value}T12:00:00Z`)) && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value
        && (index === 0 || value >= String(fields[keys[index - 1]!]));
    }) && String(fields.enrollmentDeadline) >= today;
  if (sourceId === "plovdiv-management-competitions") return typeof fields.title === "string" && typeof fields.company === "string"
    && typeof fields.place === "string" && fields.place.includes("Стамболов") && fields.time === "17:00"
    && typeof fields.published === "string" && typeof fields.deadline === "string"
    && [fields.published, fields.deadline].every(date => /^20\d{2}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/u.test(date)
      && !Number.isNaN(Date.parse(`${date}T12:00:00Z`)) && new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) === date)
    && fields.published <= today && fields.deadline >= today;
  if (sourceId === "plovdiv-public-consultations") return typeof fields.title === "string" && typeof fields.number === "string"
    && typeof fields.email === "string" && /^[a-z0-9._%+-]+@plovdiv\.bg$/iu.test(fields.email)
    && typeof fields.ways === "string" && fields.ways.split("\n").length === 4 && fields.status === "Активна"
    && typeof fields.opened === "string" && typeof fields.deadline === "string"
    && [fields.opened, fields.deadline].every(date => /^20\d{2}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/u.test(date)
      && !Number.isNaN(Date.parse(`${date}T12:00:00Z`)) && new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) === date)
    && fields.opened <= today && fields.deadline >= today && fields.deadline >= fields.opened;
  if (sourceId === "plovdiv-housing") return typeof fields.title === "string" && typeof fields.intro === "string"
    && typeof fields.body === "string" && fields.body.startsWith(fields.intro) && fields.body.length >= 250 && fields.body.length <= 9000;
  if (sourceId === "plovdiv-youth-centre") return typeof fields.title === "string" && typeof fields.place === "string"
    && typeof fields.date === "string" && typeof fields.endDate === "string" && typeof fields.time === "string"
    && typeof fields.published === "string" && fields.published <= fields.date && fields.endDate >= fields.date && fields.endDate >= today
    && [fields.date, fields.endDate, fields.published].every(date => /^20\d{2}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/u.test(date)
      && !Number.isNaN(Date.parse(`${date}T12:00:00Z`)) && new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) === date);
  if (sourceId === "plovdiv-auction-list") return typeof fields.title === "string" && typeof fields.published === "string"
    && typeof fields.deadline === "string" && typeof fields.auctionDate === "string"
    && fields.published <= today && fields.deadline >= today && fields.auctionDate >= fields.deadline
    && [fields.published, fields.deadline, fields.auctionDate].every(date => /^20\d{2}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/u.test(date)
      && !Number.isNaN(Date.parse(`${date}T12:00:00Z`)) && new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) === date);
  if (sourceId === "plovdiv-tax-notices") return typeof fields.year === "string" && fields.year === today.slice(0, 4)
    && typeof fields.label === "string" && typeof fields.dueDate === "string" && fields.dueDate.startsWith(`${fields.year}-`)
    && /^20\d{2}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/u.test(fields.dueDate)
    && !Number.isNaN(Date.parse(`${fields.dueDate}T12:00:00Z`)) && new Date(`${fields.dueDate}T12:00:00Z`).toISOString().slice(0, 10) === fields.dueDate && fields.dueDate >= today;
  if (sourceId === "plovdiv-taxes") return typeof fields.label === "string" && typeof fields.address === "string" && typeof fields.hours === "string";
  if (sourceId === "plovdiv-adoption-guide") return typeof fields.label === "string" && typeof fields.detail === "string" && fields.detail.length > 0;
  if (sourceId === "plovdiv-gallery-current") return typeof fields.title === "string" && typeof fields.venue === "string"
    && typeof fields.startDate === "string" && typeof fields.endDate === "string" && fields.endDate >= today;
  if (sourceId === "plovdiv-contacts") return typeof fields.label === "string" && typeof fields.address === "string"
    && (fields.label !== "Община Пловдив" || typeof fields.phone === "string" && typeof fields.secondPhone === "string");
  if (sourceId === "evn-heating-outages") return ["fault", "planned"].includes(String(fields.kind)) && typeof fields.address === "string" && typeof fields.issue === "string"
    && typeof fields.start === "string" && typeof fields.end === "string" && typeof fields.deadline === "string";
  if (sourceId === "plovdiv-parking-operator") return typeof fields.label === "string" && (typeof fields.phone === "string" || typeof fields.address === "string");
  if (sourceId === "plovdiv-municipal-schools") return typeof fields.name === "string" && typeof fields.type === "string"
    && typeof fields.district === "string" && typeof fields.address === "string" && typeof fields.phone === "string";
  if (sourceId === "dz-institutions") return typeof fields.institutionId === "string" && typeof fields.name === "string"
    && typeof fields.type === "string" && typeof fields.district === "string" && typeof fields.address === "string" && typeof fields.phone === "string";
  if (sourceId === "chistota-bulky-waste") return (fields.kind === "pickup" && typeof fields.phone === "string")
    || (fields.kind === "site" && typeof fields.district === "string" && typeof fields.address === "string" && typeof fields.contact === "string" && typeof fields.accepted === "string");
  if (["ecomap-containers", "ecopack-containers"].includes(sourceId)) return typeof fields.type === "string" && typeof fields.address === "string"
    && typeof fields.latitude === "number" && typeof fields.longitude === "number";
  if (sourceId === "ecomap-collection-events") return typeof fields.title === "string" && typeof fields.details === "string"
    && typeof fields.date === "string" && /^\d{4}-\d{2}-\d{2}$/u.test(fields.date) && fields.date >= today;
  if (sourceId === "plovdiv-eco-signals") return typeof fields.label === "string" && typeof fields.reason === "string"
    && typeof fields.phone === "string" && /^(?:\d-\d{3}|032\s*\d{3}\s*\d{3})$/u.test(fields.phone);
  if (sourceId === "plovdiv-transport-signals") return typeof fields.label === "string" && typeof fields.reason === "string"
    && typeof fields.phone === "string" && /^032\/\d{3}[- ]\d{3}$/u.test(fields.phone);
  if (sourceId === "plovdiv-social-services") return typeof fields.name === "string" && fields.name.length > 0 && typeof fields.services === "string" && typeof fields.description === "string";
  if (sourceId === "first-grade-vacancies") {
    return typeof fields.school === "string" && typeof fields.schoolId === "string" && typeof fields.district === "string"
      && typeof fields.year === "string" && typeof fields.ranking === "string" && typeof fields.places === "number" && fields.places > 0;
  }
  if (sourceId === "plovdiv-livetransport-gtfs") {
    return fields.serviceDate === today && typeof fields.line === "string" && typeof fields.destinations === "string";
  }
  if (sourceId === "plovdiv-airport-flights") {
    return (fields.direction === "arrival" || fields.direction === "departure")
      && typeof fields.date === "string" && fields.date >= today
      && typeof fields.time === "string" && typeof fields.flight === "string"
      && typeof fields.route === "string" && typeof fields.status === "string";
  }
  if (sourceId === "vik-outages") {
    const match = String(fields.date ?? "").match(/^(\d{2})\.(\d{2})\.(\d{4})/u);
    return !!match && `${match[3]}-${match[2]}-${match[1]}` === today;
  }
  if (sourceId === "plovdiv-opera") {
    if (typeof fields.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(fields.date)) return false;
    const date = new Date(`${fields.date}T12:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === fields.date && fields.date >= today
      && typeof fields.location === "string" && PLOVDIV_OPERA_VENUES.has(fields.location);
  }
  if (NIGHT_PROGRAMME_SOURCES.includes(sourceId)) {
    const date = String(fields.date ?? ""), parsed = new Date(date + "T12:00:00Z");
    return /^20\d{2}-\d{2}-\d{2}$/u.test(date) && Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date && date >= today
      && typeof fields.title === "string" && !!fields.title && typeof fields.place === "string" && !!fields.place
      && (fields.time === "" || /^(?:[01]\d|2[0-3]):[0-5]\d$/u.test(String(fields.time)))
      && !!programmeKind(sourceId, fields) && ["EventScheduled", "EventCancelled", "EventPostponed", "EventRescheduled"].includes(String(fields.status));
  }
  if (sourceId === "epaygo-plovdiv-explicit") {
    return typeof fields.date === "string" && /^\d{4}-\d{2}-\d{2}$/u.test(fields.date)
      && typeof fields.time === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/u.test(fields.time)
      && fields.date >= today && typeof fields.place === "string" && typeof fields.address === "string";
  }
  if (sourceId === "plovdiv-theatre") {
    const match = String(fields.dateTime ?? "").match(/^(\d{2})-(\d{2})-(\d{4})/u);
    return !!match && `${match[3]}-${match[2]}-${match[1]}` >= today;
  }
  if (sourceId === "club-code-upcoming") {
    const start = typeof fields.startDate === "string" ? Date.parse(fields.startDate) : NaN;
    const end = typeof fields.endDate === "string" ? Date.parse(fields.endDate) : NaN;
    return Number.isFinite(start) && Number.isFinite(end) && end > now.getTime() && start < end
      && typeof fields.title === "string" && typeof fields.place === "string"
      && ["EventScheduled", "EventCancelled", "EventPostponed", "EventRescheduled"].includes(String(fields.status));
  }
  return true;
}

/** Fresh observations; never infer that a missing or failed row is resolved. */
export function selectCityObservations(
  categorySlug: string,
  preview: z.infer<typeof previewSchema>,
  now = new Date(),
  preserveEmptySources = false,
): CityObservation[] {
  const today = localDay(now);
  return (CATEGORY_SOURCES[categorySlug] ?? []).flatMap(sourceId => {
    const source = preview.sources[sourceId];
    if (!source) return [];
    const age = now.getTime() - Date.parse(source.checkedAt);
    const status = source.outcome === "unavailable" ? "unavailable" : age < 0 || age > (FRESH_MS[sourceId] ?? 0) ? "stale" : "observed";
    const items = status === "observed" ? source.items.filter(item => isRelevantRow(sourceId, item.fields, today, now)
      && (sourceId !== "epaygo-plovdiv-explicit" || (categorySlug === "nightlife" ? explicitNightEventKind(item.fields) !== null : explicitNightEventKind(item.fields) === null))) : [];
    if (!preserveEmptySources && sourceId === "plovdiv-youth-centre" && items.length === 0) return [];
    if (!preserveEmptySources && (sourceId === "plovdiv-auction-list" || sourceId === "plovdiv-public-consultations") && items.length === 0) return [];
    if (!preserveEmptySources && sourceId === "plovdiv-management-competitions" && items.length === 0) return [];
    if (!preserveEmptySources && categorySlug === "nightlife" && sourceId === "epaygo-plovdiv-explicit" && items.length === 0) return [];
    if (sourceId === "plovdiv-livetransport-gtfs") items.sort((a, b) => String(a.fields.line).localeCompare(String(b.fields.line), "bg", { numeric: true }));
    if (sourceId === "plovdiv-airport-flights") items.sort((a, b) => `${a.fields.date} ${a.fields.time}`.localeCompare(`${b.fields.date} ${b.fields.time}`));
    return [{ sourceId, checkedAt: source.checkedAt, status, completeness: source.completeness, items }];
  });
}

const loadDbPreview = cache(async (sourceId: string | null) => {
  const snapshots = await readCitySnapshots({ includeHidden: process.env.NODE_ENV === "development", ...(sourceId ? { sourceId } : {}) });
  return previewSchema.parse({
    version: 1,
    sources: Object.fromEntries(snapshots.map(snapshot => [snapshot.sourceId, {
      checkedAt: snapshot.checkedAt,
      outcome: snapshot.outcome === "unavailable" ? "unavailable" : "observed",
      completeness: "uncertain",
      limitations: [],
      items: snapshot.items,
    }])),
  });
});

export async function loadCityObservations(categorySlug: string, sourceId?: string, options?: { preserveEmptySources?: boolean }): Promise<CityObservation[]> {
  if (CITY_DEFERRED_CATEGORIES.includes(categorySlug)) return [];
  if (sourceId !== undefined && (!(CATEGORY_SOURCES[categorySlug] ?? []).includes(sourceId) || !citySourceInRelease(sourceId))) return [];
  if (!cityGuideEnabled()) return [];
  const select = (data: z.infer<typeof previewSchema>) => selectCityObservations(categorySlug, data, new Date(), options?.preserveEmptySources ?? false).filter(group => citySourceInRelease(group.sourceId) && (sourceId === undefined || group.sourceId === sourceId));
  if (process.env.NODE_ENV !== "development" || process.env.CITY_GUIDE_USE_DB_PREVIEW === "1") {
    try { return select(await loadDbPreview(sourceId ?? null)); }
    catch { return []; }
  }
  const relativePath = "tests/reports/city-preview-live/preview.json";
  const paths = [resolve(process.cwd(), relativePath), resolve(process.cwd(), "../..", relativePath)];
  for (const path of paths) {
    try {
      const parsed = previewSchema.safeParse(JSON.parse(await readFile(path, "utf8")));
      return parsed.success ? select(parsed.data) : [];
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") return [];
    }
  }
  return [];
}
