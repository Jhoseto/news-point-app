import { z } from "zod";
import { CITY_SOURCE_POLICY, citySourceInRelease } from "./city-sources";

export const cityManagementInput = z.object({
  id: z.string().regex(/^[a-z0-9-]{1,150}$/),
  expectedVersion: z.string().regex(/^[a-f0-9]{32}$/),
  action: z.enum(["hide", "show", "reject", "monitor", "accept"]),
  note: z.string().trim().min(10).max(1200),
  lifecycleVerified: z.boolean().default(false),
});
export type CityManagementInput = z.infer<typeof cityManagementInput>;
export type CitySourceSummary = {
  id: string; category: string; sourceUrl: string; format: string;
  reviewState: "candidate" | "pilot" | "accepted" | "rejected";
  publicationState: "hidden" | "visible"; version: string;
  lastCheckAt: string | null; lastSuccessAt: string | null;
  outcome: string | null; error: string | null; currentRecords: number; missingRecords: number;
  firstCheckAt: string | null; successfulChecks: number; failedChecks: number;
};
export function citySourceStatus(source: CitySourceSummary, now = Date.now()) {
  if (!citySourceInRelease(source.id)) return "deferred";
  const policy = CITY_SOURCE_POLICY[source.id];
  if (!policy) return "unknown";
  if (!source.lastSuccessAt || !source.lastCheckAt) return "missing";
  const age = now - Date.parse(source.lastSuccessAt), checkAge = now - Date.parse(source.lastCheckAt);
  if (!Number.isFinite(age) || age < 0 || age > policy.staleSeconds * 1000) return "stale";
  if (source.outcome === "unavailable") return "failed";
  return checkAge > (policy.refreshSeconds + 300) * 1000 ? "overdue" : "healthy";
}
/** Seven days are necessary, not sufficient: a staff member must also attest lifecycle checks. */
export function cityAcceptanceReady(source: CitySourceSummary, now = Date.now()) {
  return citySourceStatus(source, now) === "healthy" && source.successfulChecks >= 2 && source.firstCheckAt !== null
    && Date.parse(source.lastCheckAt ?? "") - Date.parse(source.firstCheckAt) >= 7 * 86400_000;
}
export function cityManagementChange(source: CitySourceSummary, input: CityManagementInput, now = Date.now()) {
  if (source.version !== input.expectedVersion) throw new Error("conflict");
  const next = { reviewState: source.reviewState, publicationState: source.publicationState };
  if (input.action === "hide") next.publicationState = "hidden";
  if (input.action === "reject" || input.action === "monitor") {
    next.reviewState = input.action === "reject" ? "rejected" : "pilot";
    next.publicationState = "hidden";
  }
  if (input.action === "accept") {
    if (!input.lifecycleVerified || !cityAcceptanceReady(source, now)) throw new Error("not_ready");
    next.reviewState = "accepted";
    // Acceptance never implicitly publishes a source.
    next.publicationState = "hidden";
  }
  if (input.action === "show") {
    if (source.reviewState !== "accepted" || citySourceStatus(source, now) !== "healthy") throw new Error("not_ready");
    next.publicationState = "visible";
  }
  return next;
}

export const CITY_CATEGORY_LABELS: Record<string,string> = {transport:"Транспорт",parking:"Паркиране",outages:"Аварии",municipality:"Община — отложено",education:"Образование",environment:"Градска среда",events:"Култура и нощен живот",adoption:"Осинови приятел"};
export const CITY_SOURCE_LABELS: Record<string,string> = {
 "lohi-programme":"Lo/Hi Craft Space",
 "mall-plovdiv-parking":"Паркинг Mall Plovdiv", "markovo-tepe-parking":"Паркинг Марково Тепе",
 "plovdiv-community-air":"Граждански измервания на въздуха", "plovdiv-transit":"Билети и карти за транспорт", "plovdiv-livetransport-gtfs":"Автобусни разписания", "plovdiv-airport-flights":"Полетно разписание", "plovdiv-low-emission":"Нискоемисионна зона",
 "vik-outages":"Спирания на водата", "elyug-planned-plovdiv-region":"Планирани спирания на тока", "evn-heating-outages":"Топлоподаване", "plovdiv-parking-rules":"Синя и зелена зона", "plovdiv-parking-operator":"Паркиране и репатриране",
 "dz-vacancies":"Места в градини и ясли", "dz-admission-calendar":"Календар за прием", "dz-institutions":"Детски заведения", "first-grade-vacancies":"Прием в първи клас", "plovdiv-municipal-schools":"Училища",
 "chistota-bulky-waste":"Едрогабаритни отпадъци", "ecomap-containers":"Контейнери за разделно събиране", "ecopack-containers":"Контейнери за разделно събиране · ЕКОПАК", "ecomap-collection-events":"Кампании за отпадъци", "plovdiv-eco-signals":"Екологични сигнали",
 "plovdiv-theatre":"Драматичен театър", "plovdiv-opera":"Държавна опера", "plovdiv-gallery-current":"Градска галерия", "plovdiv-youth-centre":"Младежки център", "epaygo-plovdiv-explicit":"Градски събития — ePayGo", "club-code-upcoming":"Club CODE",
 "bilet-beebop":"Bee Bop Café", "bilet-download":"Download Rock Bar", "bilet-plovdiv-event-center":"Plovdiv Event Center", "bilet-colodrome":"Колодрума", "bilet-elum":"ELUM", "bushido-programme":"Bushido", "plovdiv-live-club-events":"Live Club Plovdiv",
 "plovdiv-dog-shelter":"Животни за осиновяване", "plovdiv-adoption-guide":"Условия за осиновяване"
};
