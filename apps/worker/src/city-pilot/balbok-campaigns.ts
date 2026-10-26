import { createHash } from "node:crypto";
import { parseDocument, DomUtils as D } from "htmlparser2";
import type { PilotItem, PilotSnapshot } from "./parse";

export const BALBOK_NEWS_URL = "https://www.balbok.com/bg/news";
const months = ["януари", "февруари", "март", "април", "май", "юни", "юли", "август", "септември", "октомври", "ноември", "декември"];
const clean = (text: string) => text.replace(/\s+/gu, " ").trim();
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
function calendarDate(value: string) {
  const date = new Date(`${value}T12:00:00Z`);
  return /^20\d{2}-\d{2}-\d{2}$/u.test(value) && Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
function sourceUrl(value: string) {
  const url = new URL(value, BALBOK_NEWS_URL);
  if (url.origin !== "https://www.balbok.com" || !url.pathname.startsWith("/bg/news/") || url.search || url.hash) throw new Error("BalBok: unexpected article address");
  return url.href;
}

export function balbokCampaignLinks(html: string): string[] {
  const root = parseDocument(html), list = D.getElementById("news", root);
  if (!list || !D.getElementsByTagName("li", list).length) throw new Error("BalBok: news listing missing");
  const links = D.getElementsByTagName("a", list).filter(a => /(?:^|[^\p{L}])Пловдив(?:[^\p{L}]|$)/iu.test(clean(D.textContent(a))))
    .map(a => sourceUrl(a.attribs.href ?? ""));
  const unique = [...new Set(links)];
  if (unique.length > 6) throw new Error("BalBok: unexpected number of Plovdiv articles");
  return unique;
}

export function parseBalbokCampaign(html: string, url: string): PilotItem[] {
  url = sourceUrl(url);
  const root = parseDocument(html), article = D.getElementById("left", root);
  if (!article) throw new Error("BalBok: article missing");
  for (const node of D.getElementsByTagName("script", article)) D.removeElement(node);
  const published = clean(D.textContent(D.getElementsByTagName("p", article).find(p => p.attribs.class === "datearticle") ?? root));
  const heading = clean(D.textContent(D.getElementsByTagName("h3", article)[0] ?? root));
  if (!calendarDate(published) || !/Пловдив/iu.test(heading)) throw new Error("BalBok: publication identity missing");
  const paragraphs = D.getElementsByTagName("p", article).map(p => clean(D.textContent(p))).filter(Boolean);
  const acceptedList = D.getElementsByTagName("ul", article).find(ul => /живак|лекарства|бояджийски/iu.test(D.textContent(ul)));
  const accepted = acceptedList ? D.getElementsByTagName("li", acceptedList).map(li => clean(D.textContent(li))).filter(Boolean) : [];
  if (!accepted.length || accepted.length > 15) throw new Error("BalBok: accepted waste categories missing");
  const items: PilotItem[] = [];
  for (let index = 0; index < paragraphs.length; index++) {
    const paragraph = paragraphs[index]!;
    if (!/^Община Пловдив\s*,/iu.test(paragraph)) continue;
    const match = paragraph.match(/^Община Пловдив\s*,\s*(\d{1,2})\s+([а-я]+)(?:\s+(20\d{2})(?:\s*г\.?)?)?\s+от\s+(\d{2})[:.](\d{2})\s*[-–]\s*(\d{2})[:.](\d{2})\s+часа[.!]?$/iu);
    if (!match) throw new Error("BalBok: Plovdiv date/time structure changed");
    const month = months.indexOf(match[2]!.toLowerCase()) + 1;
    const date = `${match[3] ?? published.slice(0, 4)}-${String(month).padStart(2, "0")}-${match[1]!.padStart(2, "0")}`;
    const startTime = `${match[4]}:${match[5]}`, endTime = `${match[6]}:${match[7]}`;
    if (!calendarDate(date) || date < published || Date.parse(`${date}T12:00Z`) - Date.parse(`${published}T12:00Z`) > 120 * 86400000
      || ![startTime, endTime].every(t => /^(?:[01]\d|2[0-3]):[0-5]\d$/u.test(t)) || endTime <= startTime) throw new Error("BalBok: ambiguous year or invalid campaign interval");
    const section: string[] = [];
    for (let next = index + 1; next < paragraphs.length && !/^Община\s+[^,]+,/iu.test(paragraphs[next]!); next++) section.push(paragraphs[next]!);
    const addresses = section.filter(p => /мобилни(ят|я)\s+(?:събирателен\s+)?пункт/iu.test(p) && /гр\.?\s*Пловдив/iu.test(p) && /ул\.|бул\.|пл\./iu.test(p));
    if (addresses.length !== 1) throw new Error("BalBok: unambiguous Plovdiv location missing");
    const status = /отменен[аио]?|няма да се (?:проведе|състои)/iu.test(`${heading} ${section.join(" ")}`) ? "cancelled" : /отложен[аио]?/iu.test(`${heading} ${section.join(" ")}`) ? "postponed" : "scheduled";
    const address = addresses[0]!;
    const fields = { title: "Мобилен пункт за опасни отпадъци", date, startTime, endTime, address, accepted: accepted.join("; "), published, status,
      details: `${startTime}–${endTime} ч. ${address}`, ...(status === "cancelled" ? { statusLabel: "Отменена кампания" } : status === "postponed" ? { statusLabel: "Отложена кампания" } : {}) };
    items.push({ key: hash(`${url}|plovdiv-${items.length + 1}`), sourceUrl: url, fields, fingerprint: hash(JSON.stringify(fields)) });
  }
  if (!items.length) throw new Error("BalBok: Plovdiv campaign section missing");
  return items;
}

export async function collectBalbokCampaigns(html: string, read: (url: string) => Promise<string>, now = new Date()): Promise<PilotSnapshot> {
  const items: PilotItem[] = [];
  for (const url of balbokCampaignLinks(html)) items.push(...parseBalbokCampaign(await read(url), url));
  const identities = items.map(item => `${item.fields.date}|${item.fields.address}`);
  if (new Set(identities).size !== items.length) throw new Error("BalBok: duplicate campaign across announcements");
  const today = now.toLocaleDateString("sv-SE", { timeZone: "Europe/Sofia" });
  const clock = now.toLocaleTimeString("en-GB", { timeZone: "Europe/Sofia", hourCycle: "h23", hour: "2-digit", minute: "2-digit" });
  return { sourceId: "balbok-plovdiv-campaigns", completeness: "uncertain", limitations: ["Only Plovdiv-named announcements in the operator's current news listing. A valid empty result is not proof that no other collection campaigns exist. Removed records are not automatically cancelled."],
    items: items.filter(item => String(item.fields.date) > today || item.fields.date === today && String(item.fields.endTime) > clock) };
}
