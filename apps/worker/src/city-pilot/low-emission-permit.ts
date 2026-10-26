import { createHash } from "node:crypto";
import { DomUtils, parseDocument } from "htmlparser2";
import type { ProcedureDocument } from "./procedure-documents";
import type { PilotSnapshot } from "./parse";

const sourceId = "plovdiv-low-emission-permit";
const origin = "https://www.plovdiv.bg";
const clean = (value: string) => value.replace(/\s+/gu, " ").trim();
export function lowEmissionPermitLinks(html: string): { url: string; title: string }[] {
  const content = DomUtils.getElementById("content", parseDocument(html));
  if (!content || !DomUtils.getElementsByTagName("h1", content).some(node => clean(DomUtils.textContent(node)) === "Бланки и формуляри")) throw new Error(`${sourceId}: forms page changed`);
  const section = DomUtils.getElementsByTagName("p", content).find(node => clean(DomUtils.textContent(node)) === "Зона с ниски емисии:");
  if (!section) throw new Error(`${sourceId}: section missing`);
  const links: { url: string; title: string }[] = [];
  for (let node = section.next; node; node = node.next) {
    if (clean(DomUtils.textContent(node)) === "Синя зона:") break;
    for (const link of DomUtils.getElementsByTagName("a", node)) {
      const title = clean(DomUtils.textContent(link));
      const url = new URL(link.attribs.href ?? "", origin);
      if (!["Информация", "Заявление"].includes(title) || url.origin !== origin || !/^\/wp-content\/uploads\/20\d{2}\/\d{2}\/[^/]+\.pdf$/iu.test(url.pathname) || url.search || url.hash) throw new Error(`${sourceId}: unexpected attachment`);
      links.push({ url: url.href, title });
    }
  }
  if (links.length !== 2 || new Set(links.map(link => link.title)).size !== 2 || links[0]?.url === links[1]?.url) throw new Error(`${sourceId}: incomplete document pair`);
  return links;
}

export function lowEmissionPermitSections(information: string, application: string): Record<string, string> {
  const text = clean(information), form = clean(application);
  const eligibility = text.match(/Право за навлизане и движение[\s\S]+?(?=Упоменатите лица)/u)?.[0]?.trim();
  const requiredDocuments = text.match(/представени следните документи:\s*([\s\S]+?)(?=Пропускът се издава)/u)?.[1]?.trim();
  const validity = text.match(/Пропускът се издава[\s\S]+?(?=При промяна)/u)?.[0]?.trim();
  const changes = text.match(/При промяна на декларираните[\s\S]+?(?=Заявлението за включването)/u)?.[0]?.trim();
  const submission = text.match(/попълненото Заявление следва да бъде подавано[\s\S]+?последваща обработка\./u)?.[0];
  if (!eligibility || !requiredDocuments || !validity || !changes || !submission
    || !eligibility.includes("постоянен адрес") || !eligibility.includes("исторически МПС")
    || ![1, 2, 3, 4, 5, 6].every(number => new RegExp(`(?:^| )${number}\\.\\s`, "u").test(requiredDocuments))
    || !form.includes("Приложение 1 към чл. 6, ал. 2") || !form.includes("ниски емисии")
    || !form.includes("Прилагам следните документи:") || !form.includes("6. Свидетелство за регистрация")) throw new Error(`${sourceId}: incomplete or mismatched procedure`);
  return { eligibility, requiredDocuments, validity, changes, submission };
}

export async function collectLowEmissionPermit(html: string, readDocument: (url: string, title: string) => Promise<ProcedureDocument>): Promise<PilotSnapshot> {
  const links = lowEmissionPermitLinks(html);
  const documents: ProcedureDocument[] = [];
  for (const link of links) documents.push(await readDocument(link.url, link.title === "Информация" ? "Условия за нискоемисионната зона" : "Заявление за пропуск · Приложение 1"));
  const information = documents[links.findIndex(link => link.title === "Информация")]!;
  const application = documents[links.findIndex(link => link.title === "Заявление")]!;
  const fields = { title: "Пропуск за нискоемисионната зона", ...lowEmissionPermitSections(information.text, application.text), documents: JSON.stringify(documents) };
  return { sourceId, completeness: "uncertain", limitations: ["This procedure concerns entry and movement, not a parking permit. Individual eligibility, processing time and a fee are not established by this information sheet.", "The currently linked information and blank application are checked every cycle; separate legal amendments remain outside this connector."], items: [{ key: "resident-or-historic-permit", sourceUrl: links.find(link => link.title === "Информация")!.url, fields, fingerprint: createHash("sha256").update(JSON.stringify(fields)).digest("hex") }] };
}
