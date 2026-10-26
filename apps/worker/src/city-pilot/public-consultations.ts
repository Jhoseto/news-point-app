import { createHash } from "node:crypto";
import { DomUtils, parseDocument } from "htmlparser2";
import type { PilotItem, PilotSnapshot } from "./parse";
import type { ProcedureDocument } from "./procedure-documents";

const sourceId = "plovdiv-public-consultations";
const indexUrl = "https://www.plovdiv.bg/announcements/pna/";

function clean(value: string): string { return value.replace(/\s+/gu, " ").trim(); }
function text(node: Parameters<typeof DomUtils.textContent>[0] | undefined | null): string { return node ? clean(DomUtils.textContent(node)) : ""; }
function digest(value: unknown): string { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function date(value: string): string {
  const match = value.match(/^(\d{1,2})\.(\d{1,2})\.(20\d{2})$/u);
  if (!match) throw new Error(`${sourceId}: invalid date`);
  const iso = `${match[3]}-${match[2]!.padStart(2, "0")}-${match[1]!.padStart(2, "0")}`;
  const parsed = new Date(`${iso}T12:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== iso) throw new Error(`${sourceId}: invalid calendar date`);
  return iso;
}

export type ConsultationListing = { id: string; title: string; published: string; detailUrl: string };

export function parseConsultationListing(html: string, now = new Date()): ConsultationListing[] {
  const dom = parseDocument(html);
  const content = DomUtils.getElementById("content", dom);
  if (!content || text(DomUtils.getElementsByTagName("h1", content)[0]) !== "Проекти на нормативни актове") throw new Error(`${sourceId}: municipal list heading changed`);
  const blocks = DomUtils.findAll(node => node.attribs?.class?.split(/\s+/u).includes("lnk") ?? false, content);
  if (blocks.length < 4) throw new Error(`${sourceId}: municipal list cards missing`);
  const today = now.toLocaleDateString("sv-SE", { timeZone: "Europe/Sofia" });
  const cutoff = Date.parse(`${today}T12:00:00Z`) - 60 * 24 * 60 * 60_000;
  const entries: ConsultationListing[] = [];
  const seen = new Set<string>();
  for (const block of blocks) {
    const paragraphs = DomUtils.getElementsByTagName("p", block);
    if (paragraphs.length < 2 || !text(paragraphs[0]).startsWith("Дата на публикуване:")) throw new Error(`${sourceId}: municipal card structure changed`);
    const published = date(text(paragraphs[0]).replace(/^Дата на публикуване:\s*/u, "").replace(/\s*г\.$/u, ""));
    if (published > today) throw new Error(`${sourceId}: future municipal publication date`);
    const link = DomUtils.getElementsByTagName("a", paragraphs[1]!)[0];
    if (!link || !text(link)) throw new Error(`${sourceId}: municipal project title missing`);
    const rawUrl = link.attribs.href ?? "";
    const detailUrl = new URL(rawUrl, indexUrl);
    const id = detailUrl.hostname === "strategy.bg" && detailUrl.protocol === "https:" ? detailUrl.pathname.match(/^\/bg\/public-consultations\/(\d+)\/?$/u)?.[1] : null;
    if (!id || Date.parse(`${published}T12:00:00Z`) < cutoff) continue;
    if (seen.has(id)) throw new Error(`${sourceId}: duplicate consultation ${id}`);
    seen.add(id);
    entries.push({ id, title: text(link), published, detailUrl: detailUrl.href });
  }
  if (entries.length > 8) throw new Error(`${sourceId}: detail request budget exceeded`);
  return entries;
}

export function parseConsultationDetail(html: string, entry: ConsultationListing, now = new Date()): PilotItem | null {
  const dom = parseDocument(html);
  const heading = DomUtils.getElementsByTagName("h1", dom).find(node => text(node) === entry.title);
  if (!heading) throw new Error(`${sourceId}: detail title does not match municipal listing`);
  const h3 = DomUtils.getElementsByTagName("h3", dom);
  const dateHeading = h3.find(node => text(node) === "Откриване / Приключване");
  const dateBlock = dateHeading?.parent;
  const dateText = dateBlock ? text(dateBlock) : "";
  const dateMatch = dateText.match(/^(?:Откриване \/ Приключване)\s*(\d{2}\.\d{2}\.20\d{2})\s*г\.\s*—\s*(\d{2}\.\d{2}\.20\d{2})\s*г\.\s*(Активна|Приключила)/u);
  if (!dateMatch) throw new Error(`${sourceId}: detail dates or status missing`);
  const opened = date(dateMatch[1]!);
  const deadline = date(dateMatch[2]!);
  if (opened !== entry.published || deadline < opened) throw new Error(`${sourceId}: municipal and state dates disagree`);
  const numberHeading = h3.find(node => text(node) === "Номер на консултация");
  const numberText = numberHeading?.parent ? text(numberHeading.parent) : "";
  if (!numberText.includes(`${entry.id}-K`)) throw new Error(`${sourceId}: consultation number changed`);
  const municipalityHeading = h3.find(node => text(node) === "Община");
  const municipalityText = municipalityHeading?.parent ? text(municipalityHeading.parent) : "";
  const sponsorHeading = h3.find(node => text(node) === "Вносител");
  const sponsorText = sponsorHeading?.parent ? text(sponsorHeading.parent) : "";
  if (!new Set(["Община Пловдив", "ОбщинаПловдив"]).has(municipalityText) || !sponsorText.includes("Общинска администрация - Пловдив")) throw new Error(`${sourceId}: consultation is not municipal Plovdiv`);
  const contactHeading = h3.find(node => text(node) === "Контактна информация");
  const contactText = contactHeading?.parent ? text(contactHeading.parent) : "";
  const email = contactText.match(/\b[a-z0-9._%+-]+@plovdiv\.bg\b/iu)?.[0];
  const submissionHeading = h3.find(node => text(node) === "Начини на предоставяне на предложения и становища");
  const ways = submissionHeading?.parent ? DomUtils.getElementsByTagName("li", submissionHeading.parent).map(node => text(node)) : [];
  if (!email || ways.length !== 4 || !ways.some(way => way.includes("Електронна поща"))) throw new Error(`${sourceId}: submission contacts changed`);
  const today = now.toLocaleDateString("sv-SE", { timeZone: "Europe/Sofia" });
  if (deadline < today) return null;
  if (dateMatch[3] !== "Активна") throw new Error(`${sourceId}: future deadline is not marked active`);
  const fields = { title: entry.title, opened, deadline, published: entry.published, number: `${entry.id}-K`, status: "Активна", email, ways: ways.join("\n") };
  return { key: entry.id, sourceUrl: entry.detailUrl, fields, fingerprint: digest(fields) };
}

export function consultationAttachments(html: string): { title: string; url: string }[] {
  const dom = parseDocument(html);
  const heading = DomUtils.getElementsByTagName("h3", dom).find(node => text(node) === "Документи");
  if (!heading?.parent) throw new Error(`${sourceId}: documents section missing`);
  const links = DomUtils.getElementsByTagName("a", heading.parent).filter(node => node.attribs["data-file"]);
  const documents = links.map(link => {
    const id = link.attribs["data-file"]!;
    if (!/^\d+$/u.test(id) || link.attribs["data-url"] !== `https://strategy.bg/file-preview-modal/${id}`) throw new Error(`${sourceId}: document location changed`);
    return { title: text(link), url: `https://strategy.bg/download/${id}` };
  });
  if (!documents.some(doc => doc.title.startsWith("Проект на акт"))
    || documents.length > 8 || new Set(documents.map(doc => doc.url)).size !== documents.length) throw new Error(`${sourceId}: incomplete or duplicated document package`);
  return documents;
}

export function consultationDescription(html: string): string {
  const dom = parseDocument(html);
  const heading = DomUtils.getElementsByTagName("h3", dom).find(node => text(node) === "Отговорна институция");
  let previous = heading?.parent?.prev;
  while (previous && !text(previous)) previous = previous.prev;
  const description = previous ? text(previous) : "";
  if (description.length < 60 || description.length > 30_000) throw new Error(`${sourceId}: project description missing`);
  return description;
}

export async function collectPublicConsultations(html: string, readDetail: (url: string) => Promise<string>, now = new Date(), readDocument?: (url: string, title: string) => Promise<ProcedureDocument>): Promise<PilotSnapshot> {
  const listing = parseConsultationListing(html, now);
  const items: PilotItem[] = [];
  for (const entry of listing) {
    const detail = await readDetail(entry.detailUrl);
    const item = parseConsultationDetail(detail, entry, now);
    if (item) {
      if (readDocument) {
        const documents: ProcedureDocument[] = [];
        for (const attachment of consultationAttachments(detail)) documents.push(await readDocument(attachment.url, attachment.title));
        item.fields = { ...item.fields, description: consultationDescription(detail), documents: JSON.stringify(documents) };
        item.fingerprint = digest(item.fields);
      }
      items.push(item);
    }
  }
  return { sourceId, items, completeness: "uncertain", limitations: [
    "Only municipal normative-act projects linked from this listing to a matching state consultation with an explicit active status and future deadline are included.",
    "General administrative acts, district consultations and local-only project pages are outside this pilot; a draft is not an adopted rule.",
    "Attached document packages and descriptions are checked with each active detail when document collection is enabled; drafts are not adopted rules.",
  ] };
}
