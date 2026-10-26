import { createHash } from "node:crypto";
import { DomUtils, parseDocument } from "htmlparser2";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import type { PilotItem, PilotSnapshot } from "./parse";

const sourceId = "plovdiv-auction-list";
const listingUrl = "https://www.plovdiv.bg/announcements/auctions/turgove/";
const terminationListUrl = "https://www.plovdiv.bg/announcements/messages/obyavi/";
const dayMs = 24 * 60 * 60_000;

function clean(value: string): string { return value.replace(/\s+/gu, " ").trim(); }

function isoDate(day: string, month: string, year: string): string {
  const date = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  const parsed = new Date(`${date}T12:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) throw new Error(`${sourceId}: invalid date ${date}`);
  return date;
}

function dateFrom(line: string): string {
  const match = line.match(/(\d{1,2})\s*\.\s*(\d{1,2})\s*\.\s*(20\d{2})/u);
  if (!match) throw new Error(`${sourceId}: missing dated notice field`);
  return isoDate(match[1]!, match[2]!, match[3]!);
}

type AuctionLink = { title: string; published: string; pdfUrl: string };

export function parseAuctionListing(html: string, now: Date): AuctionLink[] {
  const dom = parseDocument(html);
  const content = DomUtils.getElementById("content", dom);
  const heading = content && DomUtils.getElementsByTagName("h1", content)[0];
  if (!content || !heading || clean(DomUtils.textContent(heading)) !== "Търгове") throw new Error(`${sourceId}: listing heading missing`);
  const blocks = DomUtils.findAll(node => node.attribs?.class?.split(/\s+/u).includes("anons") ?? false, content);
  if (blocks.length < 1) throw new Error(`${sourceId}: empty or changed listing`);
  const entries: AuctionLink[] = [];
  const seen = new Set<string>();
  const today = now.toLocaleDateString("sv-SE", { timeZone: "Europe/Sofia" });
  for (const block of blocks) {
    const paragraphs = DomUtils.getElementsByTagName("p", block);
    const publishedText = paragraphs[0] ? clean(DomUtils.textContent(paragraphs[0])) : "";
    if (!publishedText.startsWith("Дата на публикуване:")) throw new Error(`${sourceId}: publication date missing`);
    const published = dateFrom(publishedText);
    if (published > today) throw new Error(`${sourceId}: future publication date`);
    if (Date.parse(`${today}T12:00:00Z`) - Date.parse(`${published}T12:00:00Z`) > 30 * dayMs) continue;
    const links = DomUtils.getElementsByTagName("a", block);
    if (links.length !== 1) throw new Error(`${sourceId}: notice link changed`);
    const title = clean(DomUtils.textContent(links[0]!));
    const pdfUrl = new URL(links[0]!.attribs.href ?? "", listingUrl);
    if (!title.startsWith("Обява") || pdfUrl.hostname !== "www.plovdiv.bg" || pdfUrl.protocol !== "https:"
      || !/^\/wp-content\/uploads\/20\d{2}\/\d{2}\/[\w()%.-]+\.pdf$/iu.test(pdfUrl.pathname)) throw new Error(`${sourceId}: unsupported notice document`);
    if (seen.has(pdfUrl.href)) throw new Error(`${sourceId}: duplicate notice document`);
    seen.add(pdfUrl.href);
    entries.push({ title, published, pdfUrl: pdfUrl.href });
  }
  if (entries.length > 8) throw new Error(`${sourceId}: more than eight recent documents; request budget exceeded`);
  return entries;
}

export function parseAuctionNoticeText(raw: string, published: string): { deadline: string; auctionDate: string } {
  const text = clean(raw).replace(/(\d)\s*([:.])\s*(\d)/gu, "$1$2$3");
  if (!/Пловдив/iu.test(text) || !/търг/iu.test(text)) throw new Error(`${sourceId}: document is not a Plovdiv auction notice`);
  const deadlineText = text.match(/(?:Документите за участие в търга се подават|Приемането на тръжна документация)[\s\S]{0,130}?до\s+(\d{1,2}\s*\.\s*\d{1,2}\s*\.\s*20\d{2})/iu)?.[1];
  const auctionText = text.match(/Търгът ще се проведе на\s+(\d{1,2}\s*\.\s*\d{1,2}\s*\.\s*20\d{2})/iu)?.[1];
  if (!deadlineText || !auctionText) throw new Error(`${sourceId}: application deadline or auction date missing`);
  const deadline = dateFrom(deadlineText);
  const auctionDate = dateFrom(auctionText);
  if (deadline < published || auctionDate < deadline) throw new Error(`${sourceId}: notice dates are inconsistent`);
  return { deadline, auctionDate };
}

export async function auctionPdfText(bytes: Uint8Array): Promise<string> {
  const loading = getDocument({ data: bytes, useSystemFonts: true, disableFontFace: true });
  try {
    const doc = await loading.promise;
    if (doc.numPages < 1 || doc.numPages > 3) throw new Error(`${sourceId}: document page count outside pilot limit`);
    const parts: string[] = [];
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
      const page = await doc.getPage(pageNumber);
      const content = await page.getTextContent();
      parts.push(content.items.flatMap(entry => "str" in entry ? [entry.str] : []).join(" "));
      page.cleanup();
    }
    return parts.join(" ");
  } finally {
    await loading.destroy();
  }
}

type Termination = { parcel: string; published: string; pdfUrl: string };

export function parseAuctionTerminations(html: string, now: Date): Termination[] {
  const dom = parseDocument(html);
  const content = DomUtils.getElementById("content", dom);
  if (!content || clean(DomUtils.textContent(DomUtils.getElementsByTagName("h1", content)[0]!)) !== "Обяви") throw new Error(`${sourceId}: termination list heading changed`);
  const blocks = DomUtils.findAll(node => node.attribs?.class?.split(/\s+/u).includes("anons") ?? false, content);
  if (!blocks.length) throw new Error(`${sourceId}: termination list empty or changed`);
  const today = now.toLocaleDateString("sv-SE", { timeZone: "Europe/Sofia" });
  const terminations: Termination[] = [];
  for (const block of blocks) {
    const paragraphs = DomUtils.getElementsByTagName("p", block);
    const publishedText = paragraphs[0] ? clean(DomUtils.textContent(paragraphs[0])) : "";
    if (!publishedText.startsWith("Дата на публикуване:")) throw new Error(`${sourceId}: termination date missing`);
    const published = dateFrom(publishedText);
    if (published > today) throw new Error(`${sourceId}: future termination date`);
    if (Date.parse(`${today}T12:00:00Z`) - Date.parse(`${published}T12:00:00Z`) > 60 * dayMs) continue;
    const links = DomUtils.getElementsByTagName("a", block);
    const cancellation = links.find(link => {
      const title = clean(DomUtils.textContent(link));
      return /търг/iu.test(title) && /(?:прекрат|отм[ея]|анулир)/iu.test(title);
    });
    if (!cancellation) continue;
    const title = clean(DomUtils.textContent(cancellation));
    const parcels = [...title.matchAll(/56784\.\d+\.\d+/gu)].map(match => match[0]);
    const pdfUrl = new URL(cancellation.attribs.href ?? "", terminationListUrl);
    if (parcels.length !== 1 || pdfUrl.hostname !== "www.plovdiv.bg" || pdfUrl.protocol !== "https:"
      || !/^\/wp-content\/uploads\/20\d{2}\/\d{2}\/[\w()%.-]+\.pdf$/iu.test(pdfUrl.pathname)) throw new Error(`${sourceId}: ambiguous termination order`);
    terminations.push({ parcel: parcels[0]!, published, pdfUrl: pdfUrl.href });
  }
  return terminations;
}

export function parseAuctionTerminationText(raw: string, parcel: string): void {
  const content = clean(raw);
  if (!/Прекратявам процедура по провеждане на публичен търг/iu.test(content)
    || !content.includes(parcel)) throw new Error(`${sourceId}: termination PDF does not confirm the listed auction parcel`);
}

export async function collectMunicipalAuctions(html: string, terminationHtml: string, readDocument: (url: string) => Promise<string>, now = new Date()): Promise<PilotSnapshot> {
  const links = parseAuctionListing(html, now);
  const terminations = parseAuctionTerminations(terminationHtml, now);
  const today = now.toLocaleDateString("sv-SE", { timeZone: "Europe/Sofia" });
  const items: PilotItem[] = [];
  for (const link of links) {
    const documentText = await readDocument(link.pdfUrl);
    const { deadline, auctionDate } = parseAuctionNoticeText(documentText, link.published);
    if (deadline < today || auctionDate < today) continue;
    const parcels = [...`${link.title} ${documentText}`.matchAll(/56784\.\d+\.\d+/gu)].map(match => match[0]);
    const parcel = [...new Set(parcels)];
    if (parcel.length !== 1) throw new Error(`${sourceId}: auction parcel is missing or ambiguous`);
    const matching = terminations.filter(termination => termination.parcel === parcel[0] && termination.published >= link.published);
    if (matching.length > 0) {
      for (const termination of matching) parseAuctionTerminationText(await readDocument(termination.pdfUrl), parcel[0]!);
      continue;
    }
    const fields = { title: link.title, published: link.published, deadline, auctionDate };
    const hash = (value: string) => createHash("sha256").update(value).digest("hex");
    items.push({ key: `pdf:${hash(link.pdfUrl).slice(0, 24)}`, sourceUrl: link.pdfUrl, fields,
      fingerprint: hash(JSON.stringify(fields) + hash(documentText)) });
  }
  return { sourceId, items, completeness: "uncertain", limitations: [
    "Only notices published in the last 30 days with validated application and auction dates are covered; this is not a complete municipal property register.",
    "The municipal general announcements list is cross-checked for parcel-matched termination orders and each matching PDF is validated; other channels may still publish changes.",
    "The runner archives the full notice and extracts amounts only for the validated table layout; paid auction dossiers are not included.",
  ] };
}
