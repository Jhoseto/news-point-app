import { createHash } from "node:crypto";
import { appendFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pilotSources, type CandidateSource } from "./catalog";
import { parsePilotPage } from "./parse";

type SourceState = {
  etag?: string;
  lastModified?: string;
  bodyHash?: string;
  lastCheckedAt?: string;
  lastSuccessAt?: string;
  lastParsedAt?: string;
  failures: number;
  nextDueAt?: string;
  items: Record<string, string>;
};

type PilotState = { version: 1; sources: Record<string, SourceState> };

const outputDir = resolve(process.env.CITY_PILOT_OUTPUT_DIR || resolve(import.meta.dirname, "../../../../tests/reports/city-source-pilot"));
const statePath = resolve(outputDir, "state.json");
const journalPath = resolve(outputDir, "runs.jsonl");
const maxBodyBytes = 4_000_000;
const agent = process.env.CITY_PILOT_USER_AGENT || "NewsPointCityPilot/0.1 (+https://newspoint.bg/)";

const intervals: Record<string, number> = {
  // This page is about 2 MB and advertises no conditional cache validator.
  // Start gently; increase only if source behaviour and value justify it.
  "vik-outages": 60 * 60_000,
  "dz-vacancies": 6 * 60 * 60_000,
  "plovdiv-council": 24 * 60 * 60_000,
  "plovdiv-opera": 6 * 60 * 60_000,
  "plovdiv-theatre": 6 * 60 * 60_000,
  "club-code-upcoming": 6 * 60 * 60_000,
};

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

async function requestSource(source: CandidateSource, previous: SourceState): Promise<{ response: Response; finalUrl: string }> {
  const expectedHost = new URL(source.url).hostname;
  let url = source.url;
  for (let redirects = 0; redirects <= 3; redirects++) {
    const headers = new Headers({ Accept: "text/html,application/xhtml+xml", "User-Agent": agent });
    if (previous.etag) headers.set("If-None-Match", previous.etag);
    if (previous.lastModified) headers.set("If-Modified-Since", previous.lastModified);
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

function differences(before: Record<string, string>, after: Record<string, string>) {
  return {
    added: Object.keys(after).filter((key) => !Object.hasOwn(before, key)),
    changed: Object.keys(after).filter((key) => Object.hasOwn(before, key) && before[key] !== after[key]),
    missing: Object.keys(before).filter((key) => !Object.hasOwn(after, key)),
  };
}

export async function runPilotSource(source: CandidateSource, previous: SourceState, now = Date.now()): Promise<{ state: SourceState; journal: Record<string, unknown> }> {
  const started = Date.now();
  let httpStatus: number | null = null;
  let retryAfter: string | null = null;
  try {
    const { response, finalUrl } = await requestSource(source, previous);
    httpStatus = response.status;
    retryAfter = response.headers.get("retry-after");
    const checkedAt = new Date(now).toISOString();
    if (response.status === 304) {
      if (!previous.bodyHash || !previous.lastParsedAt) throw new Error("304 without a prior valid snapshot");
      const state = { ...previous, failures: 0, lastCheckedAt: checkedAt, lastSuccessAt: checkedAt, nextDueAt: dueAfter(source, 0, null, now) };
      return { state, journal: { sourceId: source.id, checkedAt, httpStatus, outcome: "unchanged", durationMs: Date.now() - started, itemCount: Object.keys(state.items).length } };
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    if (!response.headers.get("content-type")?.toLowerCase().includes("text/html")) throw new Error("non-HTML response");
    const body = await bodyWithinLimit(response);
    const bodyHash = sha256(body);
    if (bodyHash === previous.bodyHash && previous.lastParsedAt) {
      const state = { ...previous, failures: 0, lastCheckedAt: checkedAt, lastSuccessAt: checkedAt, nextDueAt: dueAfter(source, 0, null, now) };
      return { state, journal: { sourceId: source.id, checkedAt, httpStatus, outcome: "unchanged", durationMs: Date.now() - started, bytes: body.byteLength, bodyHash, itemCount: Object.keys(state.items).length } };
    }
    const snapshot = parsePilotPage(source.id, decodeHtml(body, response.headers.get("content-type")));
    const items = Object.fromEntries(snapshot.items.map((entry) => [entry.key, entry.fingerprint]));
    const changes = differences(previous.items, items);
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
      items,
    };
    return { state, journal: { sourceId: source.id, checkedAt, httpStatus, finalUrl, outcome: "parsed", durationMs: Date.now() - started, bytes: body.byteLength, bodyHash, itemCount: snapshot.items.length, completeness: snapshot.completeness, limitations: snapshot.limitations, changes } };
  } catch (error) {
    const failures = (previous.failures || 0) + 1;
    const checkedAt = new Date(now).toISOString();
    const state: SourceState = { ...previous, failures, lastCheckedAt: checkedAt, nextDueAt: dueAfter(source, failures, retryAfter, now) };
    return { state, journal: { sourceId: source.id, checkedAt, httpStatus, outcome: "failed", durationMs: Date.now() - started, error: errorText(error), failures, nextDueAt: state.nextDueAt } };
  }
}

export async function run(): Promise<void> {
  const watch = process.argv.includes("--watch");
  await mkdir(outputDir, { recursive: true });
  const state = await loadState();
  do {
    for (const source of pilotSources) {
      const previous = state.sources[source.id] ?? { failures: 0, items: {} };
      if (previous.nextDueAt && Date.parse(previous.nextDueAt) > Date.now()) {
        if (!watch && process.env.CITY_PILOT_QUIET_SKIPS !== "1") process.stdout.write(`${source.id}: skipped until ${previous.nextDueAt}\n`);
        continue;
      }
      // All requests are serial, including sources on the same host.
      const result = await runPilotSource(source, previous);
      state.sources[source.id] = result.state;
      await appendFile(journalPath, JSON.stringify(result.journal) + "\n", "utf8");
      await saveState(state);
      process.stdout.write(`${source.id}: ${result.journal.outcome} (${result.journal.httpStatus ?? "network"})\n`);
    }
    if (!watch) break;
    const next = Math.min(...pilotSources.map((source) => Date.parse(state.sources[source.id]?.nextDueAt ?? ""))).valueOf();
    await new Promise((done) => setTimeout(done, Math.max(1000, Math.min(60_000, next - Date.now()))));
  } while (watch);
}
