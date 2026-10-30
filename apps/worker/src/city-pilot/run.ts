import { parseLoHi } from "./lohi-programme";
import { parseVivacomParking } from "./sms-parking";
import { collectBalbokCampaigns } from "./balbok-campaigns";
import { guardCityResponse, CityResponseError } from "./response-guard";
import { PARKING_VENUES, collectParkingVenue } from "./parking-venues";
import { cityCollectionHealth } from "@newspoint/content/city-health";
import { parsePlovdivAir } from "./air-quality";
import { parsePlannedPower } from "./planned-power";
import { citySourcePolicy, citySourceInRelease } from "@newspoint/content/city-sources";
import { VENUE_PROGRAMMES, collectVenueProgramme } from "./venue-programmes";
import { createHash, createHmac } from "node:crypto";
import { appendFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { resolve, isAbsolute } from "node:path";
import { pilotSources, type CandidateSource } from "./catalog";
import { parseClubEventDetail, parseEcomapCollectionEvents, parseEcomapContainers, parseEcopackContainers, parseEpayGoEventDetail, parseGalleryExhibitionDetail, parseOperaDetail, parsePilotPage, type PilotSnapshot } from "./parse";
import { previewAfterCheck, type LocalPreview } from "./preview";
import { parsePlovdivGtfsArchive } from "./gtfs";
import { parseKaratPlovdivSofia } from "./intercity";
import { collectTransitDocuments } from "./transit-documents";
import { collectUnionIntercity, unionIntercityRoute, unionSearchBody, unionServiceDates, UNION_TIMETABLE_URL } from "./union-collection";
import { collectFirstGradeVacancies } from "./first-grade";
import { collectMunicipalAuctions } from "./auctions";
import { collectYouthCentreEvents } from "./youth-centre";
import { collectLowEmissionPermit } from "./low-emission-permit";
import { collectAdmissionCalendar } from "./admission-calendar";
import { collectPublicConsultations } from "./public-consultations";
import { collectManagementCompetitions } from "./competitions";
import { archiveProcedurePdf, auctionConditions, competitionSections, type ProcedureDocument } from "./procedure-documents";
import { createCityPilotWriter } from "@newspoint/db/city";
import { archiveEventImage, eventImageUrl, normalizeEventTitle, theatreDetailInformation, theatreDetailPhoto, theatreProductions, type TheatreProduction } from "./event-media";

type SourceState = {
  etag?: string;
  lastModified?: string;
  bodyHash?: string;
  lastCheckedAt?: string;
  lastSuccessAt?: string;
  lastParsedAt?: string;
  failures: number;
  nextDueAt?: string;
  partition?: string;
  itemEndAt?: Record<string, string>;
  items: Record<string, string>;
};

type PilotState = { version: 1; sources: Record<string, SourceState> };

const outputDir = resolve(process.env.CITY_GUIDE_STORAGE_DIR || process.env.CITY_PILOT_OUTPUT_DIR || resolve(import.meta.dirname, "../../../../tests/reports/city-source-pilot"));
const statePath = resolve(outputDir, "state.json");
const journalPath = resolve(outputDir, "runs.jsonl");
const previewPath = process.env.CITY_PILOT_STORE_PREVIEW === "1" ? resolve(outputDir, "preview.json") : null;
const maxBodyBytes = 4_000_000;
const agent = process.env.CITY_PILOT_USER_AGENT || (process.argv.includes("--release") ? "NewsPointCity/1.0 (+https://newspoint.bg/)" : "NewsPointCityPilot/0.1 (+https://newspoint.bg/)");
const relaySourceIds = new Set(["lohi-programme"]);


export function pilotRefreshSeconds(sourceId: string): number {
  return citySourcePolicy(sourceId).refreshSeconds;
}

function sha256(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function dueAfter(source: CandidateSource, failures: number, retryAfter: string | null, now: number): string {
  const base = citySourcePolicy(source.id).refreshSeconds * 1000;
  let delay = failures ? Math.min(24 * 60 * 60_000, base * 2 ** Math.min(failures, 4)) : base;
  if (retryAfter) {
    const seconds = Number(retryAfter);
    const retryAt = Number.isFinite(seconds) ? now + seconds * 1000 : Date.parse(retryAfter);
    if (Number.isFinite(retryAt)) delay = Math.max(delay, retryAt - now);
  }
  return new Date(now + delay).toISOString();
}

async function bodyWithinLimit(response: Response, limit = maxBodyBytes): Promise<Uint8Array> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("response has no body");
  const parts: Uint8Array[] = [];
  let length = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > limit) {
      await reader.cancel();
      throw new Error(`body exceeds ${limit} bytes`);
    }
    parts.push(value);
  }
  const body = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    body.set(part, offset);
    offset += part.byteLength;
  }
  return body;
}

async function requestSource(source: CandidateSource, previous: SourceState, requireBody = false, serviceDate?: string): Promise<{ response: Response; finalUrl: string }> {
  const expectedHost = new URL(source.url).hostname;
  const unionRoute = unionIntercityRoute(source.id);
  if (unionRoute && (source.url !== UNION_TIMETABLE_URL || !serviceDate)) throw new Error("Union: invalid public timetable request");
  let url = source.url;
  for (let redirects = 0; redirects <= 3; redirects++) {
    if (source.id === "karat-plovdiv-sofia" || source.id === "plovdiv-transit-documents") {
      const target = new URL(url);
      const approved = source.id === "karat-plovdiv-sofia"
        ? target.origin === "https://karat-s.com" && /^\/bus\/plovdiv-sofia\/?$/u.test(target.pathname)
        : target.origin === "https://www.plovdiv.bg" && (target.pathname === "/item/transport/mass-public-transport/"
          || /^\/wp-content\/uploads\/20\d{2}\/(?:0[1-9]|1[0-2])\/[A-Za-z0-9_-]+\.pdf$/iu.test(target.pathname));
      if (!approved || target.username || target.password || target.port || target.search || target.hash) throw new Error("transport request left the approved public source paths");
    }
    const headers = new Headers({ Accept: source.format === "gtfs" ? "application/zip,application/octet-stream" : source.format === "pdf" ? "application/pdf" : source.format === "json" ? "application/json" : "text/html,application/xhtml+xml", "User-Agent": agent });
    if (!requireBody && previous.etag) headers.set("If-None-Match", previous.etag);
    if (!requireBody && previous.lastModified) headers.set("If-Modified-Since", previous.lastModified);
    if (unionRoute) headers.set("Content-Type", "application/x-www-form-urlencoded");
    let response = await fetch(url, { headers, redirect: "manual", signal: AbortSignal.timeout(20_000), cache: "no-store",
      ...(unionRoute ? { method: "POST", body: unionSearchBody(source.id, serviceDate!).toString() } : {}) });
    if ([202, 403].includes(response.status) && relaySourceIds.has(source.id)) {
      const relayUrl = process.env.CITY_SOURCE_RELAY_URL ?? "";
      const relaySecret = process.env.CITY_SOURCE_RELAY_SECRET ?? "";
      let endpoint: URL | null = null;
      try {
        endpoint = new URL(relayUrl);
        if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password || endpoint.port || endpoint.pathname !== "/city-source-relay/v1" || endpoint.search || endpoint.hash) endpoint = null;
      } catch { endpoint = null; }
      if (endpoint && relaySecret.length >= 32) {
        await response.body?.cancel();
        const relayAccept = headers.get("accept") ?? "";
        const relayEtag = headers.get("if-none-match") ?? "";
        const relayModified = headers.get("if-modified-since") ?? "";
        const signedValue = [url, relayAccept, relayEtag, relayModified].join("\n");
        const timestamp = String(Math.floor(Date.now() / 1000));
        const signature = createHmac("sha256", relaySecret).update(`${timestamp}\n${signedValue}`).digest("hex");
        response = await fetch(endpoint, { method: "GET", headers: { "user-agent": agent, "x-np-city-url": url, "x-np-city-accept": relayAccept, "x-np-city-if-none-match": relayEtag, "x-np-city-if-modified-since": relayModified, "x-np-city-timestamp": timestamp, "x-np-city-signature": signature }, redirect: "error", signal: AbortSignal.timeout(25_000), cache: "no-store" });
        const relayedFinalUrl = response.headers.get("x-np-relay-final-url");
        if (!relayedFinalUrl) { await response.body?.cancel(); throw new Error("city relay response missing final URL"); }
        const relayed = new URL(relayedFinalUrl);
        if (relayed.protocol !== "https:" || relayed.hostname !== expectedHost) { await response.body?.cancel(); throw new Error("city relay left the source HTTPS host"); }
        url = relayed.toString();
      }
    }
    if (![301, 302, 303, 307, 308].includes(response.status)) return { response, finalUrl: url };
    if (unionRoute) { await response.body?.cancel(); throw new Error("Union: timetable search redirect refused"); }
    const location = response.headers.get("location");
    if (!location) throw new Error("redirect without Location");
    const next = new URL(location, url);
    if (next.protocol !== "https:" || next.hostname !== expectedHost) throw new Error("redirect left the source HTTPS host");
    url = next.toString();
  }
  throw new Error("too many redirects");
}

function decodeHtml(body: Uint8Array, contentType: string | null): string {
  const declaration = contentType?.match(/charset\s*=\s*["']?([a-z0-9_-]+)/iu)?.[1];
  const head = new TextDecoder("windows-1252").decode(body.subarray(0, 2048));
  const meta = head.match(/<meta\b[^>]*charset\s*=\s*["']?([a-z0-9_-]+)/iu)?.[1];
  const charset = declaration || meta || "utf-8";
  return new TextDecoder(charset, { fatal: true }).decode(body);
}

function errorText(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const cause = (error as Error & { cause?: unknown }).cause;
  const code = cause && typeof cause === "object" && "code" in cause ? String(cause.code) : "";
  return code ? `${error.message} (${code})` : error.message;
}

async function loadState(): Promise<PilotState> {
  try {
    const parsed = JSON.parse(await readFile(statePath, "utf8")) as PilotState;
    if (parsed.version !== 1 || !parsed.sources || typeof parsed.sources !== "object") throw new Error("unsupported pilot state");
    return parsed;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { version: 1, sources: {} };
    throw error;
  }
}

async function saveState(state: PilotState): Promise<void> {
  const temp = `${statePath}.tmp`;
  await writeFile(temp, JSON.stringify(state, null, 2) + "\n", "utf8");
  await replaceSnapshot(temp, statePath);
}

async function savePreview(preview: LocalPreview): Promise<void> {
  if (!previewPath) return;
  await writeFile(`${previewPath}.tmp`, JSON.stringify(preview, null, 2) + "\n", "utf8");
  await replaceSnapshot(`${previewPath}.tmp`, previewPath);
}

async function replaceSnapshot(temp: string, target: string): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try { await rename(temp, target); return; }
    catch (error) {
      if (attempt >= 5 || !["EPERM", "EBUSY", "EACCES"].includes((error as NodeJS.ErrnoException).code ?? "")) throw error;
      await new Promise(done => setTimeout(done, 200 * (attempt + 1)));
    }
  }
}

function differences(before: Record<string, string>, after: Record<string, string>) {
  return {
    added: Object.keys(after).filter((key) => !Object.hasOwn(before, key)),
    changed: Object.keys(after).filter((key) => Object.hasOwn(before, key) && before[key] !== after[key]),
    missing: Object.keys(before).filter((key) => !Object.hasOwn(after, key)),
  };
}

export async function runPilotSource(source: CandidateSource, previous: SourceState, now = Date.now(), requireSnapshot = false): Promise<{ state: SourceState; journal: Record<string, unknown>; snapshot?: PilotSnapshot }> {
  const started = Date.now();
  const unionRoute = unionIntercityRoute(source.id);
  const detailDriven = source.id === "club-code-upcoming" || source.id === "epaygo-plovdiv-explicit";
  const alwaysParse = !!unionRoute || source.id === "plovdiv-transit-documents" || source.id === "karat-plovdiv-sofia" || source.id === "balbok-plovdiv-campaigns" || !!PARKING_VENUES[source.id] || source.id === "lohi-programme" || !!VENUE_PROGRAMMES[source.id] || ["plovdiv-theatre", "plovdiv-opera", "plovdiv-gallery-current", "plovdiv-dog-shelter"].includes(source.id) || source.id === "plovdiv-low-emission-permit" || source.id === "dz-admission-calendar" || source.id === "plovdiv-auction-list" || source.id === "plovdiv-youth-centre" || source.id === "plovdiv-public-consultations" || source.id === "plovdiv-management-competitions";
  const daySensitive = source.id === "plovdiv-livetransport-gtfs";
  const partitioned = source.id === "first-grade-vacancies";
  let httpStatus: number | null = null;
  let retryAfter: string | null = null;
  try {
    const { response, finalUrl } = await requestSource(source, previous, requireSnapshot || detailDriven || daySensitive || partitioned || alwaysParse || !!unionRoute, unionRoute ? unionServiceDates(now)[0] : undefined);
    httpStatus = response.status;
    retryAfter = response.headers.get("retry-after");
    try { guardCityResponse(response); }
    catch (error) { await response.body?.cancel(); throw error; }
    const checkedAt = new Date(now).toISOString();
    if (response.status === 304) {
      if (unionRoute) { await response.body?.cancel(); throw new Error("Union: dated search requires a fresh response body"); }
      if (!previous.bodyHash || !previous.lastParsedAt) throw new Error("304 without a prior valid snapshot");
      const state = { ...previous, failures: 0, lastCheckedAt: checkedAt, lastSuccessAt: checkedAt, nextDueAt: dueAfter(source, 0, null, now) };
      return { state, journal: { sourceId: source.id, checkedAt, httpStatus, outcome: "unchanged", durationMs: Date.now() - started, itemCount: Object.keys(state.items).length } };
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    if (source.format === "gtfs" ? !/(?:application\/zip|application\/octet-stream)/u.test(contentType) : source.format === "json" ? !contentType.includes("application/json") : !contentType.includes("text/html")) throw new Error("unexpected response content type");
    const body = await bodyWithinLimit(response, source.id === "ecopack-containers" ? 8_000_000 : unionRoute ? 1_000_000 : maxBodyBytes);
    const bodyHash = sha256(body);
    if (!requireSnapshot && !detailDriven && !daySensitive && !partitioned && !alwaysParse && !(source.id === "vik-outages" && !previous.partition) && bodyHash === previous.bodyHash && previous.lastParsedAt) {
      const state = { ...previous, failures: 0, lastCheckedAt: checkedAt, lastSuccessAt: checkedAt, nextDueAt: dueAfter(source, 0, null, now) };
      return { state, journal: { sourceId: source.id, checkedAt, httpStatus, outcome: "unchanged", durationMs: Date.now() - started, bytes: body.byteLength, bodyHash, itemCount: Object.keys(state.items).length } };
    }
    const procedureDocuments = new Map<string, ProcedureDocument>();
    const readProcedure = async (url: string, title: string) => {
      await new Promise(done => setTimeout(done, 1200));
      const pdf = await requestSource({ ...source, url, format: "pdf" }, { failures: 0, items: {} }, true);
      if (!pdf.response.ok || !pdf.response.headers.get("content-type")?.toLowerCase().includes("application/pdf")) {
        retryAfter = pdf.response.headers.get("retry-after") ?? retryAfter;
        await pdf.response.body?.cancel();
        throw new Error(`${source.id}: procedure PDF request failed (HTTP ${pdf.response.status})`);
      }
      const document = await archiveProcedurePdf(await bodyWithinLimit(pdf.response), title, outputDir);
      procedureDocuments.set(url, document);
      return document;
    };
    let snapshot = unionRoute ? await collectUnionIntercity(decodeHtml(body, response.headers.get("content-type")), source.id, now, async date => {
      await new Promise(done => setTimeout(done, 1200));
      const page = await requestSource(source, { failures: 0, items: {} }, true, date);
      httpStatus = page.response.status;
      retryAfter = page.response.headers.get("retry-after") ?? retryAfter;
      try { guardCityResponse(page.response); } catch (error) { await page.response.body?.cancel(); throw error; }
      if (!page.response.ok || !page.response.headers.get("content-type")?.toLowerCase().includes("text/html")) {
        await page.response.body?.cancel();
        throw new Error(`Union: timetable request failed (HTTP ${page.response.status})`);
      }
      return decodeHtml(await bodyWithinLimit(page.response, 1_000_000), page.response.headers.get("content-type"));
    }) : source.id === "karat-plovdiv-sofia" ? parseKaratPlovdivSofia(decodeHtml(body, response.headers.get("content-type"))) : source.id === "plovdiv-transit-documents" ? await collectTransitDocuments(decodeHtml(body, response.headers.get("content-type")), readProcedure, new Date(now)) : source.id === "ecopack-containers" ? parseEcopackContainers(new TextDecoder().decode(body)) : source.id === "balbok-plovdiv-campaigns" ? await collectBalbokCampaigns(decodeHtml(body, response.headers.get("content-type")), async url => {
      await new Promise(done => setTimeout(done, 1200));
      const detail = await requestSource({ ...source, url }, { failures: 0, items: {} }, true);
      httpStatus = detail.response.status;
      retryAfter = detail.response.headers.get("retry-after") ?? retryAfter;
      try { guardCityResponse(detail.response); }
      catch (error) { await detail.response.body?.cancel(); throw error; }
      if (!detail.response.headers.get("content-type")?.toLowerCase().includes("text/html")) {
        await detail.response.body?.cancel(); throw new Error("BalBok: unexpected article content type");
      }
      return decodeHtml(await bodyWithinLimit(detail.response), detail.response.headers.get("content-type"));
    }, new Date(now)) : source.id === "vivacom-plovdiv-parking" ? parseVivacomParking(decodeHtml(body, response.headers.get("content-type"))) : source.id === "lohi-programme" ? parseLoHi(decodeHtml(body, response.headers.get("content-type")), new Date(now)) : PARKING_VENUES[source.id] ? await collectParkingVenue(source.id, decodeHtml(body, response.headers.get("content-type")), async url => {
      await new Promise(done => setTimeout(done, 1200));
      const contact = await requestSource({ ...source, url }, { failures: 0, items: {} }, true);
      if (!contact.response.ok || !contact.response.headers.get("content-type")?.toLowerCase().includes("text/html")) {
        retryAfter = contact.response.headers.get("retry-after") ?? retryAfter;
        await contact.response.body?.cancel(); throw new Error(`parking contact request failed (HTTP ${contact.response.status})`);
      }
      return decodeHtml(await bodyWithinLimit(contact.response), contact.response.headers.get("content-type"));
    }) : source.id === "elyug-planned-plovdiv-region" ? parsePlannedPower(decodeHtml(body, response.headers.get("content-type")), new Date(now)) : source.id === "plovdiv-community-air" ? parsePlovdivAir(JSON.parse(new TextDecoder().decode(body)), new Date(now)) : VENUE_PROGRAMMES[source.id] ? await collectVenueProgramme(source.id, decodeHtml(body, response.headers.get("content-type")), async url => {
      await new Promise(done => setTimeout(done, 1200));
      const detail = await requestSource({ ...source, url }, { failures: 0, items: {} }, true);
      if (!detail.response.ok || !detail.response.headers.get("content-type")?.toLowerCase().includes("text/html")) {
        retryAfter = detail.response.headers.get("retry-after") ?? retryAfter;
        await detail.response.body?.cancel();
        throw new Error(source.id + ": event detail request failed (HTTP " + detail.response.status + ")");
      }
      return decodeHtml(await bodyWithinLimit(detail.response), detail.response.headers.get("content-type"));
    }, new Date(now)) : source.id === "plovdiv-low-emission-permit" ? await collectLowEmissionPermit(decodeHtml(body, response.headers.get("content-type")), readProcedure) : source.id === "dz-admission-calendar" ? await collectAdmissionCalendar(decodeHtml(body, response.headers.get("content-type")), readProcedure, new Date(now)) : source.id === "plovdiv-management-competitions" ? await collectManagementCompetitions(decodeHtml(body, response.headers.get("content-type")), async url => (await readProcedure(url, "Обява и условия за конкурса")).text, new Date(now), readProcedure) : source.id === "plovdiv-public-consultations" ? await collectPublicConsultations(decodeHtml(body, response.headers.get("content-type")), async (url) => {
      await new Promise(done => setTimeout(done, 1200));
      const detail = await requestSource({ ...source, url }, { failures: 0, items: {} }, true);
      if (!detail.response.ok || !detail.response.headers.get("content-type")?.toLowerCase().includes("text/html")) throw new Error("plovdiv-public-consultations: detail request failed");
      return decodeHtml(await bodyWithinLimit(detail.response), detail.response.headers.get("content-type"));
    }, new Date(now), readProcedure) : source.id === "plovdiv-youth-centre" ? await collectYouthCentreEvents(decodeHtml(body, response.headers.get("content-type")), async (url) => {
      await new Promise(done => setTimeout(done, 1200));
      const detail = await requestSource({ ...source, url }, { failures: 0, items: {} }, true);
      if (detail.response.status === 404 || detail.response.status === 410 || detail.response.status === 500) {
        await detail.response.body?.cancel();
        return null;
      }
      if (!detail.response.ok || !detail.response.headers.get("content-type")?.toLowerCase().includes("text/html")) throw new Error("plovdiv-youth-centre: detail request failed");
      return decodeHtml(await bodyWithinLimit(detail.response), detail.response.headers.get("content-type"));
    }, new Date(now), new Set(Object.keys(previous.items))) : source.id === "plovdiv-auction-list" ? await collectMunicipalAuctions(decodeHtml(body, response.headers.get("content-type")), await (async () => {
      await new Promise(done => setTimeout(done, 1200));
      const notices = await requestSource({ ...source, url: "https://www.plovdiv.bg/announcements/messages/obyavi/" }, { failures: 0, items: {} }, true);
      if (!notices.response.ok || !notices.response.headers.get("content-type")?.toLowerCase().includes("text/html")) throw new Error("plovdiv-auction-list: termination listing request failed");
      return decodeHtml(await bodyWithinLimit(notices.response), notices.response.headers.get("content-type"));
    })(), async url => (await readProcedure(url, "Обява и условия за търга")).text, new Date(now)) : daySensitive ? parsePlovdivGtfsArchive(body, now) : source.id === "ecomap-containers"
      ? parseEcomapContainers(decodeHtml(body, response.headers.get("content-type"))) : source.id === "ecomap-collection-events"
      ? parseEcomapCollectionEvents(decodeHtml(body, response.headers.get("content-type"))) : partitioned
      ? await collectFirstGradeVacancies(decodeHtml(body, response.headers.get("content-type")), async (district, schoolType) => {
        const url = new URL(source.url);
        url.searchParams.set("search", "1");
        url.searchParams.set("sDistrictId", String(district));
        if (schoolType) url.searchParams.set("sSchoolTypeId", String(schoolType));
        url.searchParams.set("sHasVacancies", "1");
        await new Promise(done => setTimeout(done, 1200));
        const page = await requestSource({ ...source, url: url.toString() }, { failures: 0, items: {} }, true);
        if (!page.response.ok || !page.response.headers.get("content-type")?.toLowerCase().includes("text/html")) throw new Error("first-grade-vacancies: district request failed");
        return decodeHtml(await bodyWithinLimit(page.response), page.response.headers.get("content-type"));
      }) : parsePilotPage(source.id, decodeHtml(body, response.headers.get("content-type")));
    if (source.id === "plovdiv-management-competitions" || source.id === "plovdiv-auction-list") {
      for (const item of snapshot.items) {
        const document = procedureDocuments.get(item.sourceUrl);
        if (!document) throw new Error("procedure: record document missing");
        const attachments: ProcedureDocument[] = typeof item.fields.documents === "string" ? JSON.parse(item.fields.documents) : [];
        item.fields = { ...item.fields, ...(source.id === "plovdiv-management-competitions" ? competitionSections(document.text) : auctionConditions(document.text)), documents: JSON.stringify([document, ...attachments]) };
        item.fingerprint = createHash("sha256").update(JSON.stringify(item.fields)).digest("hex");
      }
    }
    if (detailDriven) {
      if (snapshot.items.length > 30) throw new Error(`${source.id}: detail count exceeds pilot request budget`);
      const items = [];
      const rejected: string[] = [];
      for (const listingItem of snapshot.items) {
        await new Promise(done => setTimeout(done, 1200));
        const detailSource = { ...source, url: listingItem.sourceUrl };
        const detail = await requestSource(detailSource, { failures: 0, items: {} }, true);
        if (!detail.response.ok || !detail.response.headers.get("content-type")?.toLowerCase().includes("text/html")) throw new Error(`${source.id}: event detail request failed`);
        const detailBody = await bodyWithinLimit(detail.response);
        const html = decodeHtml(detailBody, detail.response.headers.get("content-type"));
        const verified = source.id === "club-code-upcoming" ? parseClubEventDetail(html, listingItem) : parseEpayGoEventDetail(html, listingItem);
        if (verified) items.push(verified);
        else if (Object.hasOwn(previous.items, listingItem.key)) throw new Error(`${source.id}: previously verified event lost its dated local detail`);
        else rejected.push(listingItem.key);
      }
      if (items.length === 0) throw new Error(`${source.id}: no verified local event details`);
      snapshot = { ...snapshot, items, limitations: source.id === "club-code-upcoming"
        ? ["Every listing row is checked against structured event detail; repeated observation is still needed for cancellations and removals.", "Ticket availability is not part of this pilot."]
        : [...snapshot.limitations, `${rejected.length} explicitly named candidates lacked structured detail or a Plovdiv address.`, "No explicit event status is supplied; disappearance is not proof of cancellation."] };
    }
    if (source.id === "plovdiv-opera") {
      const details = new Map<string, ReturnType<typeof parseOperaDetail>>();
      if (new Set(snapshot.items.map(entry => entry.sourceUrl)).size > 24) throw new Error("plovdiv-opera: detail request budget exceeded");
      for (const entry of snapshot.items) {
        if (!details.has(entry.sourceUrl)) {
          await new Promise(done => setTimeout(done, 1200));
          const page = await requestSource({ ...source, url: entry.sourceUrl }, { failures: 0, items: {} }, true);
          if (!page.response.ok || !page.response.headers.get("content-type")?.toLowerCase().includes("text/html")) throw new Error("plovdiv-opera: detail request failed");
          details.set(entry.sourceUrl, parseOperaDetail(decodeHtml(await bodyWithinLimit(page.response), page.response.headers.get("content-type")), String(entry.fields.title)));
        }
        entry.fields = { ...entry.fields, ...details.get(entry.sourceUrl)! };
        entry.fingerprint = createHash("sha256").update(JSON.stringify(entry.fields)).digest("hex");
      }
    }
    if (source.id === "plovdiv-gallery-current") {
      if (snapshot.items.length > 24) throw new Error("plovdiv-gallery-current: detail request budget exceeded");
      for (const entry of snapshot.items) {
        await new Promise(done => setTimeout(done, 1200));
        const page = await requestSource({ ...source, url: entry.sourceUrl }, { failures: 0, items: {} }, true);
        if (!page.response.ok || !page.response.headers.get("content-type")?.toLowerCase().includes("text/html")) throw new Error("plovdiv-gallery-current: detail request failed");
        entry.fields = { ...entry.fields, ...parseGalleryExhibitionDetail(decodeHtml(await bodyWithinLimit(page.response), page.response.headers.get("content-type")), entry) };
        entry.fingerprint = createHash("sha256").update(JSON.stringify(entry.fields)).digest("hex");
      }
    }
    if (source.id === "plovdiv-theatre") {
      await new Promise(done => setTimeout(done, 1200));
      const page = await requestSource({ ...source, url: "https://dtp.bg/production-category/current-season" }, { failures: 0, items: {} }, true);
      if (!page.response.ok) throw new Error("theatre details: programme unavailable");
      const productions = theatreProductions(decodeHtml(await bodyWithinLimit(page.response), page.response.headers.get("content-type")));
      // Both official programmes name the same author and production; no fuzzy title matching.
      const lecture = productions.get(normalizeEventTitle("Лекция № 3 за силата на словото"));
      if (lecture) productions.set(normalizeEventTitle("КАМЕН ДОНЕВ - ЗА СИЛАТА НА СЛОВОТО"), lecture);
      const elizabeth = productions.get(normalizeEventTitle("Eлизабет или кралицата девственица"));
      if (elizabeth) productions.set(normalizeEventTitle("ЕЛИЗАБЕТ или КРАЛИЦАТА ДЕВСТВЕНИЦА"), elizabeth);
      const airship = productions.get(normalizeEventTitle("Влюбеният дирижабъл. Съдбата на поета."));
      if (airship) productions.set(normalizeEventTitle("ВЛЮБЕНИЯТ ДИРИЖАБЪЛ"), airship);
      if (snapshot.items.some(entry => normalizeEventTitle(String(entry.fields.title)) === "боряна")) {
        await new Promise(done => setTimeout(done, 1200));
        const guest = await requestSource({ ...source, url: "https://dtp.bg/show/name-ihlcyi" }, { failures: 0, items: {} }, true);
        if (!guest.response.ok) throw new Error("theatre photograph: guest production unavailable");
        const html = decodeHtml(await bodyWithinLimit(guest.response), guest.response.headers.get("content-type"));
        const photo = theatreDetailPhoto(html, "Боряна");
        productions.set("боряна", { title: "Боряна", url: "https://dtp.bg/show/name-ihlcyi", ...(photo ? { imageUrl: photo } : {}) });
      }
      const selected = new Map<string, TheatreProduction>();
      for (const entry of snapshot.items) {
        const production = productions.get(normalizeEventTitle(String(entry.fields.title)));
        if (production) selected.set(production.url, production);
      }
      if (selected.size > 30) throw new Error("plovdiv-theatre: detail request budget exceeded");
      const details = new Map<string, ReturnType<typeof theatreDetailInformation>>();
      for (const production of selected.values()) {
        await new Promise(done => setTimeout(done, 1200));
        const detail = await requestSource({ ...source, url: production.url }, { failures: 0, items: {} }, true);
        if (!detail.response.ok || !detail.response.headers.get("content-type")?.toLowerCase().includes("text/html")) throw new Error("plovdiv-theatre: detail request failed");
        details.set(production.url, theatreDetailInformation(decodeHtml(await bodyWithinLimit(detail.response), detail.response.headers.get("content-type")), production.title));
      }
      for (const entry of snapshot.items) {
        const production = productions.get(normalizeEventTitle(String(entry.fields.title)));
        if (!production) continue;
        entry.fields = { ...entry.fields, ...(production.imageUrl ? { imageUrl: production.imageUrl } : {}), ...(production.duration ? { duration: production.duration } : {}), ...details.get(production.url) };
        entry.fingerprint = createHash("sha256").update(JSON.stringify(entry.fields)).digest("hex");
      }
    }
    const archived = new Map<string, Awaited<ReturnType<typeof archiveEventImage>>>();
    for (const entry of snapshot.items) {
      const url = eventImageUrl(entry.fields.imageUrl, source.url);
      if (!url) continue;
      try {
        let photo = archived.get(url);
        if (!photo) {
          await new Promise(done => setTimeout(done, 1200));
          const image = await requestSource({ ...source, url }, { failures: 0, items: {} }, true);
          if (image.response.status === 429 || image.response.status === 503) {
            retryAfter = image.response.headers.get("retry-after");
            throw new Error(`event photograph: HTTP ${image.response.status}`);
          }
          if (!image.response.ok || !image.response.headers.get("content-type")?.startsWith("image/")) throw new Error("event photograph unavailable");
          photo = await archiveEventImage(await bodyWithinLimit(image.response, 12_000_000), outputDir);
          archived.set(url, photo);
        }
        Object.assign(entry.fields, photo);
      } catch (error) {
        if (retryAfter || /HTTP (429|503)/u.test(String(error))) throw error;
        snapshot.limitations.push(`Photograph unavailable for ${entry.key}: ${errorText(error)}`);
      }
      entry.fingerprint = createHash("sha256").update(JSON.stringify(entry.fields)).digest("hex");
    }
    const items = Object.fromEntries(snapshot.items.map((entry) => [entry.key, entry.fingerprint]));
    const partition = source.id === "vik-outages" ? String(snapshot.items[0]?.fields.date ?? "") : undefined;
    const partitionRollover = !!partition && !!previous.partition && partition !== previous.partition;
    const changes = partitionRollover
      ? { added: Object.keys(items), changed: [], missing: [] }
      : differences(previous.items, items);
    const expired = source.id === "club-code-upcoming" ? changes.missing.filter((key) => {
      const end = Date.parse(previous.itemEndAt?.[key] ?? "");
      return Number.isFinite(end) && end <= now;
    }) : [];
    if (expired.length) changes.missing = changes.missing.filter((key) => !expired.includes(key));
    const itemEndAt = source.id === "club-code-upcoming"
      ? Object.fromEntries(snapshot.items.map((entry) => [entry.key, String(entry.fields.endDate)])) : undefined;
    const etag = response.headers.get("etag");
    const lastModified = response.headers.get("last-modified");
    const state: SourceState = {
      ...(etag ? { etag } : {}),
      ...(lastModified ? { lastModified } : {}),
      bodyHash,
      lastCheckedAt: checkedAt,
      lastSuccessAt: checkedAt,
      lastParsedAt: checkedAt,
      failures: 0,
      nextDueAt: dueAfter(source, 0, null, now),
      ...(partition ? { partition } : {}),
      ...(itemEndAt ? { itemEndAt } : {}),
      items,
    };
    return { state, snapshot, journal: { sourceId: source.id, checkedAt, httpStatus, finalUrl, outcome: "parsed", durationMs: Date.now() - started, bytes: body.byteLength, bodyHash, itemCount: snapshot.items.length, completeness: snapshot.completeness, limitations: snapshot.limitations, changes, ...(expired.length ? { expired } : {}), ...(partitionRollover ? { partitionRollover: { from: previous.partition, to: partition, previousCount: Object.keys(previous.items).length } } : {}) } };
  } catch (error) {
    const failures = (previous.failures || 0) + 1;
    const checkedAt = new Date(now).toISOString();
    const state: SourceState = { ...previous, failures, lastCheckedAt: checkedAt, nextDueAt: dueAfter(source, failures, retryAfter, now) };
    return { state, journal: { sourceId: source.id, checkedAt, httpStatus, outcome: "failed", durationMs: Date.now() - started, error: errorText(error), ...(error instanceof CityResponseError ? { failureReason: error.reason } : {}), failures, nextDueAt: state.nextDueAt } };
  }
}

export async function run(): Promise<void> {
  const watch = process.argv.includes("--watch");
  const release = process.argv.includes("--release");
  if (release && (!process.env.CITY_GUIDE_STORAGE_DIR || !isAbsolute(process.env.CITY_GUIDE_STORAGE_DIR) || process.env.CITY_PILOT_PERSIST_DB !== "1")) throw new Error("Release collection requires absolute CITY_GUIDE_STORAGE_DIR and DB persistence");
  const selection = process.argv.find(arg => arg.startsWith("--sources="))?.slice("--sources=".length).split(",");
  const refresh = process.argv.includes("--refresh");
  if (selection?.some(id => !pilotSources.some(source => source.id === id)) || (refresh && (!selection || watch))) throw new Error("Explicit valid --sources are required for a one-off --refresh");
  const selectedSources = pilotSources.filter(source => (!selection || selection.includes(source.id)) && (!release || citySourceInRelease(source.id)));
  if (!selectedSources.length) throw new Error("No sources in the selected collection scope");
  const writer = process.env.CITY_PILOT_PERSIST_DB === "1" ? createCityPilotWriter() : null;
  try {
    await mkdir(outputDir, { recursive: true });
    const state = await loadState();
    let preview: LocalPreview = { version: 1, sources: {} };
    if (previewPath) {
      try {
        const parsed = JSON.parse(await readFile(previewPath, "utf8")) as LocalPreview;
        if (parsed.version !== 1 || !parsed.sources || typeof parsed.sources !== "object") throw new Error("unsupported preview state");
        preview = parsed;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
    do {
      for (const source of selectedSources) {
        const previous = state.sources[source.id] ?? { failures: 0, items: {} };
        if (!refresh && previous.nextDueAt && Date.parse(previous.nextDueAt) > Date.now()) {
          if (!watch && process.env.CITY_PILOT_QUIET_SKIPS !== "1") process.stdout.write(`${source.id}: skipped until ${previous.nextDueAt}\n`);
          continue;
        }
        // All requests are serial, including sources on the same host.
        // Hide rows before a due request, so a crash during fetch or journal/state
        // persistence cannot leave the previous observation visible as current.
        const priorPreview = preview.sources[source.id];
        const requireSnapshot = !!previewPath && priorPreview?.outcome !== "observed";
        if (previewPath) {
          preview.sources[source.id] = previewAfterCheck(priorPreview, new Date().toISOString(), "checking");
          await savePreview(preview);
        }
        const result = await runPilotSource(source, previous, Date.now(), requireSnapshot);
        if (writer) await writer.write({
          source,
          checkedAt: String(result.journal.checkedAt),
          outcome: result.journal.outcome as "parsed" | "unchanged" | "failed",
          httpStatus: typeof result.journal.httpStatus === "number" ? result.journal.httpStatus : null,
          ...(typeof result.journal.error === "string" ? { error: result.journal.error.slice(0, 2000) } : {}),
          refreshSeconds: pilotRefreshSeconds(source.id),
          ...(result.snapshot ? { items: result.snapshot.items.map(({ key, fingerprint, fields }) => ({ key, fingerprint, fields })) } : {}),
        });
        state.sources[source.id] = result.state;
        await appendFile(journalPath, JSON.stringify(result.journal) + "\n", "utf8");
        await saveState(state);
        if (previewPath) {
          preview.sources[source.id] = previewAfterCheck(priorPreview, String(result.journal.checkedAt), result.journal.outcome, result.snapshot);
          await savePreview(preview);
        }
        process.stdout.write(`${source.id}: ${result.journal.outcome} (${result.journal.httpStatus ?? "network"})\n`);
      }
      const health = cityCollectionHealth(state.sources);
      const healthFile = resolve(outputDir, "collector-health.json");
      await writeFile(`${healthFile}.tmp`, JSON.stringify(health) + "\n", "utf8");
      await replaceSnapshot(`${healthFile}.tmp`, healthFile);
      if (release && !watch && health.status !== "ok") process.exitCode = 1;
      if (!watch) break;
      const next = Math.min(...selectedSources.map((source) => Date.parse(state.sources[source.id]?.nextDueAt ?? ""))).valueOf();
      await new Promise((done) => setTimeout(done, Math.max(1000, Math.min(60_000, next - Date.now()))));
    } while (watch);
  } finally {
    await writer?.close();
  }
}
