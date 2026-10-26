import { createHash } from "node:crypto";
import { DomUtils, parseDocument } from "htmlparser2";
import type { PilotItem, PilotSnapshot } from "./parse";

const sourceId = "plovdiv-management-competitions";
const listingUrl = "https://www.plovdiv.bg/announcements/messages/konkursi/";
const clean = (value: string) => value.replace(/\s+/gu, " ").trim();
const hash = (value: string) => createHash("sha256").update(value).digest("hex");

function isoDate(raw: string): string {
  const match = raw.match(/^(\d{1,2})\.(\d{1,2})\.(20\d{2})$/u);
  if (!match) throw new Error(`${sourceId}: missing date`);
  const iso = `${match[3]}-${match[2]!.padStart(2, "0")}-${match[1]!.padStart(2, "0")}`;
  if (new Date(`${iso}T12:00:00Z`).toISOString().slice(0, 10) !== iso) throw new Error(`${sourceId}: invalid calendar date`);
  return iso;
}

export type CompetitionLink = { title: string; company: string; published: string; pdfUrl: string };

export function parseCompetitionListing(html: string, now = new Date()): CompetitionLink[] {
  const content = DomUtils.getElementById("content", parseDocument(html));
  if (!content || clean(DomUtils.textContent(DomUtils.getElementsByTagName("h1", content)[0]!)) !== "Конкурси") throw new Error(`${sourceId}: listing heading changed`);
  const cards = DomUtils.findAll(node => node.attribs?.class?.split(/\s+/u).includes("anons") ?? false, content);
  if (!cards.length) throw new Error(`${sourceId}: listing cards missing`);
  const today = now.toLocaleDateString("sv-SE", { timeZone: "Europe/Sofia" });
  const cutoff = Date.parse(`${today}T12:00:00Z`) - 45 * 24 * 60 * 60_000;
  const links: CompetitionLink[] = [];
  const seen = new Set<string>();
  for (const card of cards) {
    const paragraphs = DomUtils.getElementsByTagName("p", card);
    const publication = paragraphs[0] ? clean(DomUtils.textContent(paragraphs[0])) : "";
    if (!publication.startsWith("Дата на публикуване:")) throw new Error(`${sourceId}: publication date missing`);
    const published = isoDate(publication.replace(/^Дата на публикуване:\s*/u, "").replace(/\s*г\.$/u, ""));
    if (published > today) throw new Error(`${sourceId}: future publication date`);
    if (Date.parse(`${published}T12:00:00Z`) < cutoff) continue;
    const titleLink = paragraphs[1] && DomUtils.getElementsByTagName("a", paragraphs[1])[0];
    if (!titleLink) throw new Error(`${sourceId}: recent notice missing title`);
    const title = clean(DomUtils.textContent(titleLink));
    if (!/^Обява за (?:провеждане на )?конкурс за възлагане управлението на /iu.test(title)) continue;
    const company = title.match(/[“„"]\s*([^“”"]+?)\s*[”"]\s*ЕООД/iu)?.[1]?.trim();
    const pdfUrl = new URL(titleLink.attribs.href ?? "", listingUrl);
    if (!company || pdfUrl.protocol !== "https:" || pdfUrl.hostname !== "www.plovdiv.bg"
      || !/^\/wp-content\/uploads\/20\d{2}\/\d{2}\/[\w()%.-]+\.pdf$/iu.test(pdfUrl.pathname)) throw new Error(`${sourceId}: unsupported management notice`);
    if (seen.has(pdfUrl.href)) throw new Error(`${sourceId}: duplicate competition PDF`);
    seen.add(pdfUrl.href);
    links.push({ title, company, published, pdfUrl: pdfUrl.href });
  }
  if (links.length > 6) throw new Error(`${sourceId}: PDF request budget exceeded`);
  return links;
}

export function parseCompetitionNoticeText(raw: string, link: CompetitionLink, now = new Date()): PilotItem | null {
  const text = clean(raw);
  const company = clean(link.company).toLocaleLowerCase("bg");
  if (!text.toLocaleLowerCase("bg").includes(company) || !/Конкурс\s+за\s+възлагане\s+управлението/iu.test(text)) throw new Error(`${sourceId}: company or position differs from listing`);
  const deadlineLine = text.match(/Срок за подаване на документи:\s*до\s*[\s\S]{0,100}?\s*г\s*\./iu)?.[0];
  if (!deadlineLine) throw new Error(`${sourceId}: explicit PDF deadline missing`);
  const normalized = deadlineLine.replace(/(?<=\d)\s+(?=\d)/gu, "");
  const deadlineMatch = normalized.match(/до\s*(\d{1,2})\s*[.:]\s*(\d{2})\s*часа\s*на\s*(\d{1,2})\s*\.\s*(\d{1,2})\s*\.\s*(20\d{2})/iu);
  if (!deadlineMatch) throw new Error(`${sourceId}: PDF deadline format changed`);
  const deadline = isoDate(`${deadlineMatch[3]}.${deadlineMatch[4]}.${deadlineMatch[5]}`);
  const time = `${deadlineMatch[1]!.padStart(2, "0")}:${deadlineMatch[2]}`;
  const submission = text.match(/Документите за участие в конкурс[а-я\s]* се подават[\s\S]{0,280}/iu)?.[0] ?? "";
  if (deadline < link.published || !/^17:00$/u.test(time)
    || !/на община Пловдив,\s*пл\.[\s\S]{0,70}?Стамболов/iu.test(submission)) throw new Error(`${sourceId}: publication, time or submission place inconsistent`);
  const today = now.toLocaleDateString("sv-SE", { timeZone: "Europe/Sofia" });
  if (deadline < today) return null;
  const fields = { title: link.title, company: link.company, published: link.published, deadline, time, place: "Деловодство на Община Пловдив, пл. „Стефан Стамболов“ № 1" };
  return { key: `pdf:${hash(link.pdfUrl).slice(0, 24)}`, sourceUrl: link.pdfUrl, fields, fingerprint: hash(JSON.stringify(fields) + hash(text)) };
}

export async function collectManagementCompetitions(html: string, readPdf: (url: string) => Promise<string>, now = new Date()): Promise<PilotSnapshot> {
  const links = parseCompetitionListing(html, now);
  const items: PilotItem[] = [];
  for (const link of links) {
    const item = parseCompetitionNoticeText(await readPdf(link.pdfUrl), link, now);
    if (item) items.push(item);
  }
  return { sourceId, items, completeness: "uncertain", limitations: [
    "Only recent PDF notices for management competitions of municipal companies with an explicit future application deadline are included; ordinary municipal vacancies are outside this pilot.",
    "The application deadline and location are checked in each PDF; eligibility, attached forms, stages, withdrawals and cancellations still require separate verification.",
  ] };
}
