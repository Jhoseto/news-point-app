import { createHash } from "node:crypto";
import { appendFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pilotSources, type CandidateSource } from "./catalog";
import { parseClubEventDetail, parseEcomapCollectionEvents, parseEcomapContainers, parseEpayGoEventDetail, parsePilotPage, type PilotSnapshot } from "./parse";
import { previewAfterCheck, type LocalPreview } from "./preview";
import { parsePlovdivGtfsArchive } from "./gtfs";
import { collectFirstGradeVacancies } from "./first-grade";
import { auctionPdfText, collectMunicipalAuctions } from "./auctions";
import { collectYouthCentreEvents } from "./youth-centre";
import { collectPublicConsultations } from "./public-consultations";
import { collectManagementCompetitions } from "./competitions";
import { createCityPilotWriter } from "@newspoint/db/city";

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

const outputDir = resolve(process.env.CITY_PILOT_OUTPUT_DIR || resolve(import.meta.dirname, "../../../../tests/reports/city-source-pilot"));
const statePath = resolve(outputDir, "state.json");
const journalPath = resolve(outputDir, "runs.jsonl");
const previewPath = process.env.CITY_PILOT_STORE_PREVIEW === "1" ? resolve(outputDir, "preview.json") : null;
const maxBodyBytes = 4_000_000;
const agent = process.env.CITY_PILOT_USER_AGENT || "NewsPointCityPilot/0.1 (+https://newspoint.bg/)";

const intervals: Record<string, number> = {
  // This page is about 2 MB and advertises no conditional cache validator.
  // Start gently; increase only if source behaviour and value justify it.
  "vik-outages": 60 * 60_000,
  "evn-heating-outages": 60 * 60_000,
  "plovdiv-parking-rules": 24 * 60 * 60_000,
  "plovdiv-parking-operator": 24 * 60 * 60_000,
  "plovdiv-municipal-schools": 24 * 60 * 60_000,
  "plovdiv-transit": 24 * 60 * 60_000,
  "plovdiv-low-emission": 24 * 60 * 60_000,
  "plovdiv-livetransport-gtfs": 6 * 60 * 60_000,
  "plovdiv-airport-flights": 60 * 60_000,
  "dz-vacancies": 6 * 60 * 60_000,
  "dz-institutions": 24 * 60 * 60_000,
  "first-grade-vacancies": 24 * 60 * 60_000,
  "plovdiv-social-services": 24 * 60 * 60_000,
  "plovdiv-contacts": 24 * 60 * 60_000,
  "plovdiv-transport-signals": 24 * 60 * 60_000,
  "plovdiv-tax-notices": 24 * 60 * 60_000,
  "plovdiv-auction-list": 24 * 60 * 60_000,
  "plovdiv-housing": 24 * 60 * 60_000,
  "plovdiv-public-consultations": 24 * 60 * 60_000,
  "plovdiv-management-competitions": 24 * 60 * 60_000,
  "plovdiv-youth-centre": 6 * 60 * 60_000,
  "plovdiv-taxes": 24 * 60 * 60_000,
  "chistota-bulky-waste": 24 * 60 * 60_000,
  "ecomap-containers": 24 * 60 * 60_000,
  "ecomap-collection-events": 24 * 60 * 60_000,
  "plovdiv-eco-signals": 24 * 60 * 60_000,
  "plovdiv-council": 24 * 60 * 60_000,
  "plovdiv-opera": 6 * 60 * 60_000,
  "plovdiv-theatre": 6 * 60 * 60_000,
  "club-code-upcoming": 6 * 60 * 60_000,
  "epaygo-plovdiv-explicit": 6 * 60 * 60_000,
  "plovdiv-dog-shelter": 24 * 60 * 60_000,
  "plovdiv-gallery-current": 6 * 60 * 60_000,
  "plovdiv-adoption-guide": 24 * 60 * 60_000,
};

export function pilotRefreshSeconds(sourceId: string): number {
  return Math.round((intervals[sourceId] ?? 24 * 60 * 60_000) / 1000);
}

function sha256(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function dueAfter(source: CandidateSource, failures: number, retryAfter: string | null, now: number): string {
  const base = intervals[source.id] ?? 24 * 60 * 60_000;
  let delay = failures ? Math.min(24 * 60 * 60_000, base * 2 ** Math.min(failures, 4)) : base;
  if (retryAfter) {
    const seconds = Number(retryAfter);
    const retryAt = Number.isFinite(seconds) ? now + seconds * 1000 : Date.parse(retryAfter);
    if (Number.isFinite(retryAt)) delay = Math.max(delay, retryAt - now);
  }
  return new Date(now + delay).toISOString();
}

async function bodyWithinLimit(response: Response): Promise<Uint8Array> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("response has no body");
  const parts: Uint8Array[] = [];
  let length = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > maxBodyBytes) {
      await reader.cancel();
      throw new Error(`body exceeds ${maxBodyBytes} bytes`);
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

async function requestSource(source: CandidateSource, previous: SourceState, requireBody = false): Promise<{ response: Response; finalUrl: string }> {
  const expectedHost = new URL(source.url).hostname;
  let url = source.url;
  for (let redirects = 0; redirects <= 3; redirects++) {
    const headers = new Headers({ Accept: source.format === "gtfs" ? "application/zip,application/octet-stream" : source.format === "pdf" ? "application/pdf" : source.format === "json" ? "application/json" : "text/html,application/xhtml+xml", "User-Agent": agent });
    if (!requireBody && previous.etag) headers.set("If-None-Match", previous.etag);
    if (!requireBody && previous.lastModified) headers.set("If-Modified-Since", previous.lastModified);
    const response = await fetch(url, { headers, redirect: "manual", signal: AbortSignal.timeout(20_000), cache: "no-store" });
    if (![301, 302, 303, 307, 308].includes(response.status)) return { response, finalUrl: url };
    const location = response.headers.get("location");
    if (!location) throw new Error("redirect without Location");
    const next = new URL(location, url);
    if (next.protocol !== "https:" || next.hostname !== expectedHost) throw new Error("redirect left the source HTTPS host");
    url = next.toString();
  }
  throw new Error("too many redirects");
}

function decodeHtml(body: Uint8Array, contentType: string | null): string {
  const charset = contentType?.match(/charset=([^;\s]+)/iu)?.[1]?.replace(/["']/gu, "") || "utf-8";
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
  await rename(temp, statePath);
}

async function savePreview(preview: LocalPreview): Promise<void> {
  if (!previewPath) return;
  await writeFile(`${previewPath}.tmp`, JSON.stringify(preview, null, 2) + "\n", "utf8");
  await rename(`${previewPath}.tmp`, previewPath);
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
  const detailDriven = source.id === "club-code-upcoming" || source.id === "epaygo-plovdiv-explicit";
  const alwaysParse = source.id === "plovdiv-auction-list" || source.id === "plovdiv-youth-centre" || source.id === "plovdiv-public-consultations" || source.id === "plovdiv-management-competitions";
  const daySensitive = source.id === "plovdiv-livetransport-gtfs";
  const partitioned = source.id === "first-grade-vacancies";
  let httpStatus: number | null = null;
  let retryAfter: string | null = null;
  try {
    const { response, finalUrl } = await requestSource(source, previous, requireSnapshot || detailDriven || daySensitive || partitioned || alwaysParse);
    httpStatus = response.status;
    retryAfter = response.headers.get("retry-after");
    const checkedAt = new Date(now).toISOString();
    if (response.status === 304) {
      if (!previous.bodyHash || !previous.lastParsedAt) throw new Error("304 without a prior valid snapshot");
      const state = { ...previous, failures: 0, lastCheckedAt: checkedAt, lastSuccessAt: checkedAt, nextDueAt: dueAfter(source, 0, null, now) };
      return { state, journal: { sourceId: source.id, checkedAt, httpStatus, outcome: "unchanged", durationMs: Date.now() - started, itemCount: Object.keys(state.items).length } };
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    if (source.format === "gtfs" ? !/(?:application\/zip|application\/octet-stream)/u.test(contentType) : source.format === "json" ? !contentType.includes("application/json") : !contentType.includes("text/html")) throw new Error("unexpected response content type");
    const body = await bodyWithinLimit(response);
    const bodyHash = sha256(body);
    if (!requireSnapshot && !detailDriven && !daySensitive && !partitioned && !alwaysParse && !(source.id === "vik-outages" && !previous.partition) && bodyHash === previous.bodyHash && previous.lastParsedAt) {
      const state = { ...previous, failures: 0, lastCheckedAt: checkedAt, lastSuccessAt: checkedAt, nextDueAt: dueAfter(source, 0, null, now) };
      return { state, journal: { sourceId: source.id, checkedAt, httpStatus, outcome: "unchanged", durationMs: Date.now() - started, bytes: body.byteLength, bodyHash, itemCount: Object.keys(state.items).length } };
    }
    let snapshot = source.id === "plovdiv-management-competitions" ? await collectManagementCompetitions(decodeHtml(body, response.headers.get("content-type")), async (url) => {
      await new Promise(done => setTimeout(done, 1200));
      const pdf = await requestSource({ ...source, url, format: "pdf" }, { failures: 0, items: {} }, true);
      if (!pdf.response.ok || !pdf.response.headers.get("content-type")?.toLowerCase().includes("application/pdf")) throw new Error("plovdiv-management-competitions: notice PDF request failed");
      return auctionPdfText(await bodyWithinLimit(pdf.response));
    }, new Date(now)) : source.id === "plovdiv-public-consultations" ? await collectPublicConsultations(decodeHtml(body, response.headers.get("content-type")), async (url) => {
      await new Promise(done => setTimeout(done, 1200));
      const detail = await requestSource({ ...source, url }, { failures: 0, items: {} }, true);
      if (!detail.response.ok || !detail.response.headers.get("content-type")?.toLowerCase().includes("text/html")) throw new Error("plovdiv-public-consultations: detail request failed");
      return decodeHtml(await bodyWithinLimit(detail.response), detail.response.headers.get("content-type"));
    }, new Date(now)) : source.id === "plovdiv-youth-centre" ? await collectYouthCentreEvents(decodeHtml(body, response.headers.get("content-type")), async (url) => {
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
    })(), async (url) => {
      await new Promise(done => setTimeout(done, 1200));
      const pdf = await requestSource({ ...source, url, format: "pdf" }, { failures: 0, items: {} }, true);
      if (!pdf.response.ok || !pdf.response.headers.get("content-type")?.toLowerCase().includes("application/pdf")) throw new Error("plovdiv-auction-list: document request failed");
      return auctionPdfText(await bodyWithinLimit(pdf.response));
    }, new Date(now)) : daySensitive ? parsePlovdivGtfsArchive(body, now) : source.id === "ecomap-containers"
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
    return { state, journal: { sourceId: source.id, checkedAt, httpStatus, outcome: "failed", durationMs: Date.now() - started, error: errorText(error), failures, nextDueAt: state.nextDueAt } };
  }
}

export async function run(): Promise<void> {
  const watch = process.argv.includes("--watch");
  const writer = process.env.CITY_PILOT_PERSIST_DB === "1" ? createCityPilotWriter() : null;
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
    for (const source of pilotSources) {
      const previous = state.sources[source.id] ?? { failures: 0, items: {} };
      if (previous.nextDueAt && Date.parse(previous.nextDueAt) > Date.now()) {
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
      state.sources[source.id] = result.state;
      await appendFile(journalPath, JSON.stringify(result.journal) + "\n", "utf8");
      await saveState(state);
      if (previewPath) {
        preview.sources[source.id] = previewAfterCheck(priorPreview, String(result.journal.checkedAt), result.journal.outcome, result.snapshot);
        await savePreview(preview);
      }
      if (writer) await writer.write({
        source,
        checkedAt: String(result.journal.checkedAt),
        outcome: result.journal.outcome as "parsed" | "unchanged" | "failed",
        httpStatus: typeof result.journal.httpStatus === "number" ? result.journal.httpStatus : null,
        ...(typeof result.journal.error === "string" ? { error: result.journal.error.slice(0, 2000) } : {}),
        refreshSeconds: pilotRefreshSeconds(source.id),
        ...(result.snapshot ? { items: result.snapshot.items.map(({ key, fingerprint, fields }) => ({ key, fingerprint, fields })) } : {}),
      });
      process.stdout.write(`${source.id}: ${result.journal.outcome} (${result.journal.httpStatus ?? "network"})\n`);
    }
    if (!watch) break;
    const next = Math.min(...pilotSources.map((source) => Date.parse(state.sources[source.id]?.nextDueAt ?? ""))).valueOf();
    await new Promise((done) => setTimeout(done, Math.max(1000, Math.min(60_000, next - Date.now()))));
  } while (watch);
  await writer?.close();
}
