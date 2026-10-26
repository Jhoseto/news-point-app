import { createHash } from "node:crypto";
import { DomUtils as D, parseDocument } from "htmlparser2";
import { eventImageUrl, normalizeEventTitle } from "./event-media";
import type { PilotItem, PilotSnapshot } from "./parse";

export const VENUE_PROGRAMMES: Record<string, { url: string; venue: string; kind: "live" | "party"; provider?: "id24" }> = {
  "goliamata-maritsa-programme": { url: "https://tv.plovdiv24.bg/a9748.html", venue: "Клуб Ресторант Голямата Марица", kind: "live", provider: "id24" },
  "bilet-sinatra": { url: "https://bilet.bg/bg/venues/piano-bar-sinatra-plovdiv-1523", venue: "Пиано бар Синатра Пловдив", kind: "live" },
  "bilet-beebop": { url: "https://bilet.bg/bg/venues/bee-bop-cafe-179", venue: "Bee Bop Café", kind: "live" },
  "bilet-download": { url: "https://bilet.bg/bg/venues/rock-bar-download-109", venue: "Rock Bar Download", kind: "live" },
  "bilet-plovdiv-event-center": { url: "https://bilet.bg/bg/venues/plovdivevent-center-478", venue: "Plovdiv Event Center", kind: "party" },
  "bilet-colodrome": { url: "https://bilet.bg/bg/venues/colodrome-plovdiv-714", venue: "Арена Колодрум Пловдив", kind: "live" },
  "bilet-elum": { url: "https://bilet.bg/bg/venues/elum-club-1435", venue: "Elum club", kind: "party" },
  "bushido-programme": { url: "https://tv.plovdiv24.bg/a9627.html", venue: "Bushido Club", kind: "live", provider: "id24" },
  "plovdiv-live-club-events": { url: "https://liveclubplovdiv.com/events.html", venue: "Live Club Plovdiv", kind: "live" },
};
const clean = (v: string) => v.replace(/\s+/gu, " ").trim();
const hash = (v: string) => createHash("sha256").update(v).digest("hex");
const months = ["януари", "февруари", "март", "април", "май", "юни", "юли", "август", "септември", "октомври", "ноември", "декември"];
function calendar(date: string): string {
  const parsed = new Date(`${date}T12:00:00Z`);
  if (!/^20\d{2}-\d{2}-\d{2}$/u.test(date) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) throw new Error("programme: invalid date");
  return date;
}
function visibleDate(text: string): string | null {
  const numeric = text.match(/\b(\d{1,2})\.(\d{1,2})\.(20\d{2})\b/u);
  if (numeric) return calendar(`${numeric[3]}-${numeric[2]!.padStart(2, "0")}-${numeric[1]!.padStart(2, "0")}`);
  const words = text.toLowerCase().match(new RegExp(`\\b(\\d{1,2})\\s+(${months.join("|")})\\s+(20\\d{2})`, "u"));
  return words ? calendar(`${words[3]}-${String(months.indexOf(words[2]!) + 1).padStart(2, "0")}-${words[1]!.padStart(2, "0")}`) : null;
}
function item(key: string, sourceUrl: string, fields: PilotItem["fields"]): PilotItem { return { key, sourceUrl, fields, fingerprint: hash(JSON.stringify(fields)) }; }
type Entry = { url: string; date: string };
export function venueListing(sourceId: string, html: string): Entry[] {
  const config = VENUE_PROGRAMMES[sourceId];
  if (!config) throw new Error("unknown venue programme");
  const dom = parseDocument(html);
  const cards = D.getElementsByTagName("article", dom);
  const result = new Map<string, Entry>();
  for (const card of cards) {
    const link = D.getElementsByTagName("a", card).find(n => config.provider === "id24" ? /^\/spravochnik\/events\/\d+\.html$/u.test(n.attribs.href ?? "") : /^\/bg\/events\/[a-z0-9-]+-\d+$/u.test(n.attribs.href ?? ""));
    if (!link) continue;
    const date = D.getElementsByTagName("span", card).map(n => visibleDate(clean(D.textContent(n)))).find(Boolean) ?? visibleDate(clean(D.textContent(card)));
    if (!date) throw new Error("programme: listing date missing");
    const url = new URL(link.attribs.href!, config.provider === "id24" ? "https://www.plovdiv24.bg" : config.url).href;
    result.set(url, { url, date });
  }
  // An empty/changed listing is a failed check, never proof that all events were cancelled.
  if (!result.size || result.size > 24) throw new Error("programme: missing listing or request budget exceeded");
  return [...result.values()];
}
function eventObjects(html: string): Record<string, any>[] {
  const dom = parseDocument(html);
  const result: Record<string, any>[] = [];
  const visit = (node: any) => {
    if (Array.isArray(node)) { node.forEach(visit); return; }
    if (!node || typeof node !== "object") return;
    if (["Event", "MusicEvent"].includes(node["@type"])) result.push(node);
    if (node["@graph"]) visit(node["@graph"]);
  };
  for (const s of D.getElementsByTagName("script", dom).filter(n => n.attribs.type === "application/ld+json")) {
    try { visit(JSON.parse(D.textContent(s))); } catch { throw new Error("programme: malformed structured data"); }
  }
  return result;
}
export function venueDetail(sourceId: string, html: string, entry: Entry): PilotItem | null {
  const config = VENUE_PROGRAMMES[sourceId]!;
  const events = eventObjects(html).filter(e => e.url === entry.url || (typeof e.url === "string" && e.url.replace("www.bilet.bg", "bilet.bg") === entry.url));
  if (events.length !== 1) throw new Error("programme: event identity missing or ambiguous");
  const e = events[0]!;
  const schedulePattern = /^(20\d{2}-\d{2}-\d{2})T([01]\d|2[0-3]):([0-5]\d)(?::00)?(?:\+0[23]:00)?$/u;
  let start = typeof e.startDate === "string" ? e.startDate.match(schedulePattern) : null;
  let visibleSchedule = false;
  if (config.provider === "id24") {
    const root = parseDocument(html);
    const row = D.findOne(n => n.attribs.class?.split(/\s/u).includes("event-details") ?? false, root);
    const texts = row ? D.getElementsByTagName("span", row).filter(n => n.attribs.class === "brief").map(n => clean(D.textContent(n))) : [];
    const dates = texts.map(visibleDate).filter(date => date !== null);
    const clocks = texts.map(text => text.match(/^((?:[01]\d|2[0-3]):[0-5]\d)\s*ч\.?$/u)?.[1]).filter(time => time !== undefined);
    const venue = row ? D.getElementsByTagName("a", row).map(a => normalizeEventTitle(D.textContent(a))) : [];
    if (dates.length !== 1 || dates[0] !== entry.date || clocks.length !== 1 || !venue.includes(normalizeEventTitle(config.venue))) throw new Error("programme: visible schedule or venue missing");
    if (typeof e.startDate === "string" && /^1970-01-01T/u.test(e.startDate)) {
      // Known publisher placeholder; all actual fields come from the visible
      // dated detail, independently matching the listing and venue identity.
      start = `${dates[0]}T${clocks[0]}`.match(schedulePattern); visibleSchedule = true;
    } else {
      if (!start || start[1] !== dates[0] || `${start[2]}:${start[3]}` !== clocks[0]) throw new Error("programme: structured and visible schedules disagree");
      if (/[+-]\d{2}:\d{2}$/u.test(String(e.startDate))) {
        const instant = new Date(String(e.startDate));
        const localDate = instant.toLocaleDateString("sv-SE", { timeZone: "Europe/Sofia" });
        const localTime = instant.toLocaleTimeString("en-GB", { timeZone: "Europe/Sofia", hourCycle: "h23", hour: "2-digit", minute: "2-digit" });
        if (localDate !== dates[0] || localTime !== clocks[0]) throw new Error("programme: timezone and visible schedule disagree");
      }
    }
  }
  const address = e.location?.address;
  if (!start || !address || !/^(?:Пловдив|Plovdiv)$/iu.test(clean(String(address.addressLocality))) || normalizeEventTitle(String(e.location.name)) !== normalizeEventTitle(config.venue)) throw new Error("programme: date or Plovdiv venue mismatch");
  const date = calendar(start[1]!);
  if (date !== entry.date) throw new Error("programme: listing and detail dates disagree");
  const status = String(e.eventStatus ?? "").replace(/^https?:\/\/schema.org\//u, "");
  if (!["EventScheduled", "EventCancelled", "EventPostponed", "EventRescheduled"].includes(status)) throw new Error("programme: unsupported event status");
  const title = clean(D.textContent(parseDocument(String(e.name ?? ""))));
  if (!title || !address.streetAddress) throw new Error("programme: required content missing");
  const dom = parseDocument(html);
  const about = D.getElementsByTagName("h3", dom).find(n => clean(D.textContent(n)) === "За събитието");
  const body = about?.parent ? D.findOne(n => n.attribs.class?.split(/\s/u).includes("rich-text") ?? false, about.parent) : null;
  const blockTags = new Set(["p", "li", "h1", "h2", "h3", "h4"]);
  const blocks = body ? D.findAll(n => (blockTags.has(n.name) || n.name === "div") && !D.findOne(child => blockTags.has(child.name) || child.name === "div", n.children), body.children) : [];
  const description = (body ? (blocks.length ? blocks : body.children).map(n => clean(D.textContent(n))).filter(Boolean)
    // Multi-city tour copy can contain a paragraph for a different stop. Keep the
    // verified local programme and shared conditions, never rewrite that city.
    .filter(text => !/(?:София|Sofia|Варна|Varna|Бургас|Burgas)/iu.test(text) || /Пловдив|Plovdiv/iu.test(text))
    .filter(text => !/^Чуйте (?:ги|го) тук:/iu.test(text)).join("\n\n") : clean(typeof e.description === "string" ? D.textContent(parseDocument(e.description)) : "")).replace(/https?:\/\/\S+/gu, "").slice(0, 12000);
  // Venue alone does not turn a lecture, sports match or business meeting into nightlife.
  const music = /концерт|\bconcert\b|\blive\b|tribute|на живо|рок груп|лайфове|сценично присъствие|\bband\b|(?:^|[^\p{L}])бенд(?:[^\p{L}]|$)/iu.test(`${title} ${description}`);
  const party = /party|парти|\bdj\b|диджей|techno|house|танц|halloween|showcase|pop.dance|hot pop|wonder girls|купон до зори|сръбски хитове/iu.test(`${title} ${description}`);
  const standup = /stand[\s-]?up|стенд[\s-]?ъп/iu.test(title);
  if (!music && !party && !standup && sourceId !== "bushido-programme") return null;
  const eventKind = standup ? "standup" : music ? "live" : sourceId === "bushido-programme" ? "live" : "party";
  const images = Array.isArray(e.image) ? e.image : [e.image];
  const imageUrl = images.map(v => eventImageUrl(v, entry.url)).find(Boolean);
  const doors = description.match(/(?:Врати(?:те)?(?:\s+отварят\s+в)?|Doors)\s*:?\s*([01]?\d|2[0-3]):([0-5]\d)/iu);
  const performance = description.match(/(?:Начало|Show starts)\s*:\s*([01]?\d|2[0-3]):([0-5]\d)/iu);
  // Only an explicit standalone fixed admission line establishes a price.
  // Ranges, "from", table packages and missing prices remain unknown.
  const admission = description.split(/\n/u).map(line => line.trim().match(/^[^\p{L}\p{N}]*Вход\s*:?\s*(\d+(?:[,.]\d{1,2})?)\s*(?:€|EUR|евро)\s*[.!]?$/iu))
    .filter(match => match !== null).map(match => Number(match[1]!.replace(",", ".")));
  const fixedPrice = admission.length === 1 && admission[0]! >= 0 && admission[0]! < 5000 ? admission[0] : undefined;
  return item(`event:${entry.url.match(/(?:-|\/)(\d+)(?:\.html)?$/u)![1]}`, entry.url, {
    title, date, endDate: date, time: `${start[2]}:${start[3]}`, place: config.venue, address: clean(address.streetAddress), status, eventKind, description,
    ...(visibleSchedule ? { scheduleOrigin: "visible-details" } : {}),
    ...(doors ? { doorsTime: `${doors[1]!.padStart(2, "0")}:${doors[2]}` } : {}),
    ...(performance ? { performanceTime: `${performance[1]!.padStart(2, "0")}:${performance[2]}` } : {}),
    ...(fixedPrice !== undefined ? { price: fixedPrice } : {}),
    ...(imageUrl ? { imageUrl } : {}),
  });
}

export function liveClubProgramme(html: string, now = new Date()): PilotItem[] {
  const config = VENUE_PROGRAMMES["plovdiv-live-club-events"]!;
  const dom = parseDocument(html);
  const cards = D.getElementsByTagName("article", dom).filter(n => n.attribs.class?.split(/\s/u).includes("event-card"));
  if (!cards.length) throw new Error("Live Club: programme cards missing");
  const today = now.toLocaleDateString("sv-SE", { timeZone: "Europe/Sofia" });
  return cards.flatMap(card => {
    const heading = D.getElementsByTagName("h3", card)[0];
    const meta = D.findOne(n => n.attribs.class === "event-meta", card);
    const paragraph = D.getElementsByTagName("p", card)[0];
    if (!heading || !meta || !paragraph || !card.attribs.id) throw new Error("Live Club: card structure changed");
    const schedule = clean(D.textContent(meta));
    const weekly = schedule === "Всеки четвъртък";
    let date = visibleDate(schedule);
    if (weekly) {
      const next = new Date(`${today}T12:00:00Z`); next.setUTCDate(next.getUTCDate() + (4 - next.getUTCDay() + 7) % 7); date = next.toISOString().slice(0, 10);
    }
    if (!date) {
      if (/^Сезон 20\d{2}(?:\/20\d{2})?$/u.test(schedule)) return [];
      throw new Error("Live Club: unsupported schedule");
    }
    if (date < today) return [];
    const photo = D.findOne(n => n.attribs.class === "event-image", card);
    const imageUrl = eventImageUrl(photo?.attribs.style?.match(/url\(['"]?([^'")]+)['"]?\)/u)?.[1], config.url);
    const title = clean(D.textContent(heading));
    const description = clean(D.textContent(paragraph));
    return [item(`event:${card.attribs.id}`, `${config.url}#${card.attribs.id}`, { title, description, date, endDate: date, time: "", place: config.venue, address: "", status: /отмен/iu.test(`${title} ${description}`) ? "EventCancelled" : "EventScheduled", eventKind: "live", ...(weekly ? { recurrence: schedule } : {}), ...(imageUrl ? { imageUrl } : {}) })];
  });
}

export async function collectVenueProgramme(sourceId: string, html: string, read: (url: string) => Promise<string>, now = new Date()): Promise<PilotSnapshot> {
  const today = now.toLocaleDateString("sv-SE", { timeZone: "Europe/Sofia" });
  const items: PilotItem[] = [];
  let omitted = 0;
  if (sourceId === "plovdiv-live-club-events") items.push(...liveClubProgramme(html, now));
  else for (const entry of venueListing(sourceId, html)) {
    if (entry.date < today) continue;
    const event = venueDetail(sourceId, await read(entry.url), entry);
    if (event) items.push(event); else omitted++;
  }
  return { sourceId, items, completeness: "uncertain", limitations: [
    "Only the venue's listed dated programmes are covered; removal is not proof of cancellation. Changes outside these pages and ticket availability are not covered.",
    `${omitted} entries without explicit music, party or stand-up context omitted. Weekly programmes are labelled as recurring, not separately confirmed dates.`,
  ] };
}
