import { eventImageUrl } from "./event-media";
import { createHash } from "node:crypto";
import { DomUtils, parseDocument } from "htmlparser2";
import type { PilotItem, PilotSnapshot } from "./parse";

const sourceId = "plovdiv-youth-centre";
const baseUrl = "https://youthcentre.plovdiv.bg/bg/novini/kategoria/subitiya";
const months = new Map([
  ["януари", 1], ["февруари", 2], ["март", 3], ["април", 4], ["май", 5], ["юни", 6],
  ["юли", 7], ["август", 8], ["септември", 9], ["октомври", 10], ["ноември", 11], ["декември", 12],
]);

function clean(value: string): string { return value.replace(/\s+/gu, " ").trim(); }
function digest(value: string): string { return createHash("sha256").update(value).digest("hex"); }
function dateOf(year: number, month: number, day: number): string {
  const value = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const parsed = new Date(`${value}T12:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw new Error(`${sourceId}: invalid calendar date`);
  return value;
}

export type YouthListing = { title: string; published: string; detailUrl: string };

export function parseYouthListing(html: string, now: Date): YouthListing[] {
  const dom = parseDocument(html);
  const heading = DomUtils.getElementsByTagName("h2", dom).find(node => clean(DomUtils.textContent(node)) === "Предстоящи събития");
  if (!heading) throw new Error(`${sourceId}: events listing missing`);
  const blocks = DomUtils.findAll(node => node.attribs?.class?.split(/\s+/u).includes("subpage-description") ?? false, dom);
  if (!blocks.length) throw new Error(`${sourceId}: listing cards missing`);
  const today = now.toLocaleDateString("sv-SE", { timeZone: "Europe/Sofia" });
  const links: YouthListing[] = [];
  const seen = new Set<string>();
  for (const block of blocks) {
    const titleNode = DomUtils.getElementsByTagName("h2", block)[0];
    const titleLink = titleNode && DomUtils.getElementsByTagName("a", titleNode)[0];
    const dateNode = DomUtils.findOne(node => node.attribs?.class?.split(/\s+/u).includes("date") ?? false, block);
    if (!titleLink || !dateNode) throw new Error(`${sourceId}: card structure changed`);
    const title = clean(DomUtils.textContent(titleLink));
    const date = clean(DomUtils.textContent(dateNode)).match(/^(\d{2})-(\d{2})-(20\d{2})$/u);
    if (!title || !date) throw new Error(`${sourceId}: card publication date missing`);
    const published = dateOf(Number(date[3]), Number(date[2]), Number(date[1]));
    if (published > today) throw new Error(`${sourceId}: future publication date`);
    const href = new URL(titleLink.attribs.href ?? "", baseUrl);
    if (href.protocol !== "https:" || href.hostname !== "youthcentre.plovdiv.bg" || !/^\/bg\/novini\/[a-z0-9-]+$/u.test(href.pathname)) throw new Error(`${sourceId}: unsupported detail URL`);
    if (seen.has(href.href)) throw new Error(`${sourceId}: duplicate detail URL`);
    seen.add(href.href);
    if (Date.parse(`${today}T12:00:00Z`) - Date.parse(`${published}T12:00:00Z`) <= 45 * 24 * 60 * 60_000) links.push({ title, published, detailUrl: href.href });
  }
  if (links.length > 12) throw new Error(`${sourceId}: recent detail request budget exceeded`);
  return links;
}

export function parseYouthDetail(html: string, listing: YouthListing): PilotItem | null {
  const dom = parseDocument(html);
  const body = DomUtils.findOne(node => node.attribs?.class?.split(/\s+/u).includes("vert-pics") ?? false, dom);
  const heading = body && DomUtils.getElementsByTagName("h2", body)[0];
  if (!body || !heading || clean(DomUtils.textContent(heading)) !== listing.title) return null;
  const content = clean(DomUtils.textContent(body));
  if (!/Младежки център Пловдив/iu.test(content)) return null;
  let date = "";
  let endDate = "";
  let time = "";
  const range = content.match(/Кога\?\s*(\d{1,2})\s*[-–]\s*(\d{1,2})\.(\d{1,2})\.(20\d{2})/iu);
  if (range) {
    date = dateOf(Number(range[4]), Number(range[3]), Number(range[1]));
    endDate = dateOf(Number(range[4]), Number(range[3]), Number(range[2]));
  } else {
    const single = content.match(/На\s+(\d{1,2})\s+(януари|февруари|март|април|май|юни|юли|август|септември|октомври|ноември|декември)\s+от\s+([01]?\d|2[0-3]):([0-5]\d)\s*ч\./iu);
    if (!single) return null;
    const month = months.get(single[2]!.toLowerCase());
    if (!month) return null;
    let year = Number(listing.published.slice(0, 4));
    date = dateOf(year, month, Number(single[1]));
    if (date < listing.published) date = dateOf(++year, month, Number(single[1]));
    endDate = date;
    time = `${single[3]!.padStart(2, "0")}:${single[4]}`;
  }
  if (date < listing.published || endDate < date || Date.parse(`${date}T12:00:00Z`) - Date.parse(`${listing.published}T12:00:00Z`) > 60 * 24 * 60 * 60_000 || Date.parse(`${endDate}T12:00:00Z`) - Date.parse(`${date}T12:00:00Z`) > 7 * 24 * 60 * 60_000) return null;
  const room = content.match(/зала\s*[„"]([^“”"]+)[“”"]/iu)?.[1];
  const place = room ? `Младежки център Пловдив · зала „${room}“` : "Младежки център Пловдив";
  const picture = DomUtils.getElementsByTagName("img", body).map(node => eventImageUrl(node.attribs.src, listing.detailUrl)).find(Boolean);
  const description = DomUtils.getElementsByTagName("p", body).map(paragraph => clean(DomUtils.textContent(paragraph)))
    .filter(value => value.length >= 20 && value !== listing.title).join("\n\n").slice(0, 12_000);
  const fields = { ...(picture ? { imageUrl: picture } : {}), title: listing.title, date, endDate, time, place, published: listing.published, ...(description ? { description } : {}) };
  return { key: `event:${digest(listing.detailUrl).slice(0, 24)}`, sourceUrl: listing.detailUrl, fields, fingerprint: digest(JSON.stringify(fields) + digest(content)) };
}

export async function collectYouthCentreEvents(html: string, readDetail: (url: string) => Promise<string | null>, now = new Date(), previouslyVerified: ReadonlySet<string> = new Set()): Promise<PilotSnapshot> {
  const listing = parseYouthListing(html, now);
  const today = now.toLocaleDateString("sv-SE", { timeZone: "Europe/Sofia" });
  const items: PilotItem[] = [];
  let unverified = 0;
  for (const entry of listing) {
    const detail = await readDetail(entry.detailUrl);
    const event = detail && parseYouthDetail(detail, entry);
    if (!event) {
      if (previouslyVerified.has(`event:${digest(entry.detailUrl).slice(0, 24)}`)) throw new Error(`${sourceId}: previously verified detail became unavailable`);
      unverified++;
      continue;
    }
    if (String(event.fields.endDate) >= today) items.push(event);
  }
  if (listing.length > 0 && unverified === listing.length) throw new Error(`${sourceId}: no recent detail could be verified`);
  return { sourceId, items, completeness: "uncertain", limitations: [
    "Only recent listing entries with an explicit date and Youth Center location in their individual detail are included; article publication date is never used as event date.",
    `${unverified} recent listing entries lacked a verifiable detail, date or venue and were omitted.`,
    "Calendar posters, registration availability and cancellation outside the detail page are not covered.",
  ] };
}
