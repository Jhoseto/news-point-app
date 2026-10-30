import { createHash } from "node:crypto";
import { DomUtils, parseDocument } from "htmlparser2";
import type { PilotItem, PilotSnapshot } from "./parse";
import type { ProcedureDocument } from "./procedure-documents";

const sourceId = "plovdiv-transit-documents";
const origin = "https://www.plovdiv.bg";
const heading = "Масов градски транспорт-маршрути, разписание, карти, спирки";
const clean = (value: string) => value.replace(/\s+/gu, " ").trim();
type TransitDocumentLink = { line: string; title: string; url: string };
function fail(message: string): never { throw new Error(`${sourceId}: ${message}`); }

/** The current official index contains 29 lines. Reject a truncated index before fetching any PDF. */
export function transitDocumentLinks(html: string): TransitDocumentLink[] {
  const content = DomUtils.getElementById("content", parseDocument(html));
  if (!content || !DomUtils.getElementsByTagName("h1", content).some(node => clean(DomUtils.textContent(node)) === heading)
    || !clean(DomUtils.textContent(content)).includes("Актуални маршрутни разписания на автобусни линии от МГТ на гр. Пловдив")) fail("timetable index changed");
  const lines = new Map<string, TransitDocumentLink>();
  const urls = new Set<string>();
  for (const anchor of DomUtils.getElementsByTagName("a", content)) {
    const label = clean(DomUtils.textContent(anchor));
    if (!/^Маршрутно разписание на автобусна линия(?:\s|$)/iu.test(label)) continue;
    const line = label.match(/^Маршрутно разписание на автобусна линия\s+(?:№\s*)?([1-9]\d{0,2})$/iu)?.[1];
    const href = anchor.attribs.href ?? "";
    if (!line || !href || /[%\\\u0000-\u0020\u007f]/u.test(href)) fail("invalid timetable link");
    let url: URL;
    try { url = new URL(href, origin); } catch { fail("invalid timetable URL"); }
    if (url.origin !== origin || url.username || url.password || url.search || url.hash
      || !/^\/wp-content\/uploads\/20\d{2}\/(?:0[1-9]|1[0-2])\/[A-Za-z0-9_-]+\.pdf$/iu.test(url.pathname)) fail("unapproved timetable attachment");
    const previous = lines.get(line);
    if (previous?.url === url.href) continue;
    if (previous || urls.has(url.href)) fail("ambiguous line document");
    lines.set(line, { line, title: `Маршрутно разписание за линия ${line}`, url: url.href });
    urls.add(url.href);
    if (lines.size > 35) fail("timetable document budget exceeded");
  }
  if (lines.size < 29) fail("incomplete timetable index");
  return [...lines.values()].sort((a, b) => Number(a.line) - Number(b.line));
}

function isoDate(raw: string): string {
  const [day, month, year] = raw.split(".");
  const iso = `${year}-${month!.padStart(2, "0")}-${day!.padStart(2, "0")}`;
  const parsed = new Date(`${iso}T12:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== iso) fail("invalid validity date");
  return iso;
}

/** Preserve the original table. Flattened PDF text is used only to verify its identity and validity. */
export function parseTransitDocument(document: ProcedureDocument, link: TransitDocumentLink, now: Date): PilotItem {
  if (!/^[a-f0-9]{64}$/u.test(document.hash) || !Number.isInteger(document.pages) || document.pages < 1 || document.pages > 80
    || document.text.length < 100 || document.text.length > 400_000 || document.text.includes("\uFFFD")) fail("invalid timetable document");
  const text = clean(document.text);
  // Line 93 uses the shorter official heading on all pages, including its timetable tables.
  const lineNumbers = [...text.matchAll(/(?:Маршрутно разписание|Маршрут) на автобусна линия\s*№\s*([1-9]\d{0,2})(?!\d)/giu)].map(match => match[1]!);
  if (!/ОБЩИНА ПЛОВДИВ/iu.test(text) || !/ОРГАНИЗАЦИЯ И КОНТРОЛ НА ТРАНСПОРТА/iu.test(text)
    || !lineNumbers.length || lineNumbers.some(line => line !== link.line)) fail(`line ${link.line}: document identity mismatch`);
  if (!/(?:^|\s)Делник(?=\s|$)/iu.test(text) || !/(?:^|\s)Празник(?=\s|$)/iu.test(text)) fail(`line ${link.line}: weekday or holiday section missing`);
  // Ignore the separate operator-contract interval, which can extend ten years beyond the timetable.
  const periods = [...text.matchAll(/в сила от\s+(\d{1,2}\.\d{1,2}\.20\d{2})\s*(?:г\.?\s*)?до\s+(\d{1,2}\.\d{1,2}\.20\d{2})(?!\d)/giu)]
    .map(match => ({ validFrom: isoDate(match[1]!), validThrough: isoDate(match[2]!) }));
  if (!periods.length) fail(`line ${link.line}: explicit timetable validity missing`);
  const { validFrom, validThrough } = periods[0]!;
  if (validFrom > validThrough || periods.some(period => period.validFrom !== validFrom || period.validThrough !== validThrough)) fail(`line ${link.line}: conflicting validity periods`);
  if (!Number.isFinite(now.getTime())) fail("invalid collection date");
  const today = now.toLocaleDateString("sv-SE", { timeZone: "Europe/Sofia" });
  if (today < validFrom || today > validThrough) fail(`line ${link.line}: timetable outside its stated validity`);
  const fields = { line: link.line, title: link.title, validFrom, validThrough, dayTypes: "Делник / Празник", documents: JSON.stringify([document]) };
  return { key: link.line, sourceUrl: link.url, fields, fingerprint: createHash("sha256").update(JSON.stringify(fields)).digest("hex") };
}

export async function collectTransitDocuments(html: string, readPdf: (url: string, title: string) => Promise<ProcedureDocument>, now: Date): Promise<PilotSnapshot> {
  const links = transitDocumentLinks(html);
  const items: PilotItem[] = [];
  // Sequential and fail-closed: an unavailable or invalid document never produces a fresh partial snapshot.
  // The injected archive reader enforces the existing 4 MB / 80-page PDF limits and request pacing.
  for (const link of links) items.push(parseTransitDocument(await readPdf(link.url, link.title), link, now));
  return {
    sourceId, items, completeness: "uncertain",
    limitations: [
      "Official documents preserve weekday and holiday timetables; no day type is assigned automatically to a calendar date.",
      "Timetable tables are not interpreted as intermediate-stop predictions or live arrivals. Read the original PDF to preserve terminal, direction, arrival and departure columns.",
      "The stated validity can end earlier under a superseding municipal order. The currently linked PDFs are checked on each collection; separate temporary diversions remain outside this connector.",
    ],
  };
}
