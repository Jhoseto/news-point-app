import { createHash } from "node:crypto";
import { DomUtils, parseDocument } from "htmlparser2";
import type { PilotSnapshot } from "./parse";
import type { ProcedureDocument } from "./procedure-documents";

const sourceId = "dz-admission-calendar";
const months = ["януари", "февруари", "март", "април", "май", "юни", "юли", "август", "септември", "октомври", "ноември", "декември"];
function fail(message: string): never { throw new Error(`${sourceId}: ${message}`); }
function isoDate(value: string, year: string): string {
  const [day, month] = value.split(".");
  const iso = `${year}-${month}-${day}`;
  const date = new Date(`${iso}T12:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== iso) fail("invalid calendar date");
  return iso;
}

export function admissionCalendarLink(html: string, now: Date): { year: string; url: string } {
  const dom = parseDocument(html);
  const heading = DomUtils.getElementById("pageTitle", dom);
  const year = heading && DomUtils.textContent(heading).trim().match(/^Срокове за кандидатстване през (20\d{2}) г\.$/u)?.[1];
  if (!year || year !== now.toLocaleDateString("sv-SE", { timeZone: "Europe/Sofia" }).slice(0, 4)) fail("current-year heading missing");
  const body = DomUtils.getElementById("pageContent", dom);
  if (!body) fail("calendar section missing");
  const links = [...new Set(DomUtils.getElementsByTagName("a", body).filter(a => /pdf/iu.test(DomUtils.textContent(a))).map(a => a.attribs.href))];
  if (links.length !== 1 || !/^https:\/\/dz-priem\.plovdiv\.bg\/doc\/\d+$/u.test(links[0] ?? "")) fail("ambiguous calendar document");
  return { year, url: links[0]! };
}

export function parseAdmissionCalendar(document: ProcedureDocument, year: string, url: string, now: Date): PilotSnapshot {
  const text = document.text.replace(/\s+/gu, " ");
  if (!text.includes(`на дейностите за ${year} календарна година`) || !text.includes("общинските детски ясли и детски градини")
    || !text.includes("от родителите по интернет") || !text.includes("подаване на документите за записване от родителите при директорите")) fail("calendar headings changed");
  const table = text.split("Забележки:")[0]!;
  // Special May/June rounds have merged cells and are intentionally not interpreted as regular rounds.
  const rows = [...table.matchAll(/текущо\s+(?:20\d{2}\s*\/\s*20\d{2}\s+)?(\d{1,2})\s*-\s*([а-я]+)\s+((?:\d{2}\.\d{2}\s+){5}\d{2}\.\d{2})/gu)];
  const expected = [...table.matchAll(/текущо\s+(?:20\d{2}\s*\/\s*20\d{2}\s+)?\d{1,2}\s*-/gu)].length;
  if (rows.length < 8 || rows.length !== expected) fail("incomplete regular-round calendar");
  const today = now.toLocaleDateString("sv-SE", { timeZone: "Europe/Sofia" });
  const seen = new Set<string>();
  const items = rows.flatMap(row => {
    const dates = row[3]!.split(/\s+/u).map(value => isoDate(value, year));
    const [vacanciesDate, inPersonDeadline, onlineDeadline, resultsDate, enrollmentDeadline, registrationDate] = dates as [string, string, string, string, string, string];
    if (dates.some((date, index) => index > 0 && date < dates[index - 1]!)
      || resultsDate !== `${year}-${String(months.indexOf(row[2]!) + 1).padStart(2, "0")}-${row[1]!.padStart(2, "0")}`
      || seen.has(resultsDate)) fail("inconsistent or duplicate round dates");
    seen.add(resultsDate);
    if (enrollmentDeadline < today) return [];
    const fields = { title: `Текущо класиране · ${row[1]} ${row[2]}`, year, vacanciesDate, inPersonDeadline, onlineDeadline, resultsDate, enrollmentDeadline, registrationDate, documents: JSON.stringify([document]) };
    return [{ key: resultsDate, sourceUrl: url, fields, fingerprint: createHash("sha256").update(JSON.stringify(fields)).digest("hex") }];
  });
  return { sourceId, items, completeness: "uncertain", limitations: ["Only regular rounds with parent enrollment deadlines not yet passed are structured. Special May/June rounds remain in the attached full calendar.", "Dates do not prove individual eligibility, admission, vacancies or operating hours; no closing hour is stated."] };
}

export async function collectAdmissionCalendar(html: string, readDocument: (url: string, title: string) => Promise<ProcedureDocument>, now: Date): Promise<PilotSnapshot> {
  const { year, url } = admissionCalendarLink(html, now);
  return parseAdmissionCalendar(await readDocument(url, `График за прием в градини и ясли · ${year}`), year, url, now);
}
