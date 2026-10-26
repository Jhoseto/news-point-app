import { createHash } from "node:crypto";
import { DomUtils, parseDocument } from "htmlparser2";
import type { PilotSnapshot } from "./parse";

type School = { schoolId: string; school: string; district: string; schoolType: string; classes: number; places: number; sopPlaces: number };
type Page = { count: number; year: string; ranking: string; classes: number; places: number; schools: School[] };
type Root = ReturnType<typeof parseDocument>;
type HtmlElement = ReturnType<typeof DomUtils.getElementsByTagName>[number];

const baseUrl = "https://priem.plovdiv.bg/vacancies";
const districts: Record<number, string> = { 1: "Централен", 2: "Северен", 3: "Източен", 4: "Южен", 5: "Западен", 6: "Тракия" };
const schoolTypes: Record<number, string> = { 2: "Начални училища", 3: "Основни училища", 4: "Средни училища", 5: "Обединени училища" };

function clean(value: string): string { return value.replace(/\s+/gu, " ").trim(); }
function elementText(node: Parameters<typeof DomUtils.textContent>[0] | undefined): string { return node ? clean(DomUtils.textContent(node)) : ""; }
function byClass(dom: Root | HtmlElement, className: string) {
  return DomUtils.findAll(node => node.attribs.class?.split(/\s+/u).includes(className) ?? false, dom);
}
function positiveInteger(value: string, allowZero = false): number {
  const parsed = Number(value);
  if (!/^\d+$/u.test(value) || !Number.isSafeInteger(parsed) || (allowZero ? parsed < 0 : parsed <= 0)) throw new Error("first-grade-vacancies: invalid numeric field");
  return parsed;
}

export function parseFirstGradePage(html: string): Page {
  const dom = parseDocument(html);
  const result = DomUtils.getElementById("vacancies_result", dom);
  const schoolSelect = DomUtils.getElementById("sSchoolId", dom);
  const yearSelect = DomUtils.getElementById("sSchoolYear", dom);
  if (!result || !schoolSelect || !yearSelect) throw new Error("first-grade-vacancies: result or school controls missing");
  const countMatch = html.match(/\.pagination\((\d+),/u);
  if (!countMatch) throw new Error("first-grade-vacancies: pagination count missing");
  const count = positiveInteger(countMatch[1]!, true);
  const selectedYear = DomUtils.getElementsByTagName("option", yearSelect).find(option => Object.hasOwn(option.attribs, "selected"));
  const selectedValue = selectedYear?.attribs.value;
  if (!selectedValue || !/^20\d{2}$/u.test(selectedValue) || elementText(selectedYear) !== `${selectedValue}/${Number(selectedValue) + 1}`) throw new Error("first-grade-vacancies: selected school year changed");
  if (count === 0) {
    const heading = elementText(byClass(dom, "list-main-title")[0]);
    const ranking = heading.match(/^Свободни места след ([а-я]+) класиране$/u)?.[1];
    if (!ranking || byClass(result, "school-district-title1").length) throw new Error("first-grade-vacancies: empty filter structure changed");
    return { count, year: `${selectedValue}/${Number(selectedValue) + 1}`, ranking, classes: 0, places: 0, schools: [] };
  }
  const heading = elementText(byClass(result, "school-table-title0")[0]);
  const match = heading.match(/^Места след ([а-я]+) класиране за учебна година (20\d{2})\/(20\d{2})$/u);
  if (!match || Number(match[3]) !== Number(match[2]) + 1) throw new Error("first-grade-vacancies: ranking or school year changed");
  const year = `${match[2]}/${match[3]}`;
  if (selectedValue !== match[2]) throw new Error("first-grade-vacancies: selected school year differs");
  const summary = byClass(result, "school-table-title1")[0];
  const totals = summary ? byClass(summary, "vacancies-table-title-txt").map(elementText) : [];
  if (totals.length !== 2) throw new Error("first-grade-vacancies: global totals missing");
  const classes = positiveInteger(totals[0]!);
  const places = positiveInteger(totals[1]!);
  const options = new Map<string, string[]>();
  for (const option of DomUtils.getElementsByTagName("option", schoolSelect)) {
    if (!/^\d+$/u.test(option.attribs.value ?? "")) continue;
    const name = elementText(option);
    options.set(name, [...(options.get(name) ?? []), option.attribs.value!]);
  }
  const schools: School[] = [];
  for (const title of byClass(result, "school-district-title1")) {
    const parts = elementText(title).split(/\s*\/\s*/u);
    if (parts.length !== 3) throw new Error("first-grade-vacancies: school heading changed");
    const [schoolType, district, school] = parts as [string, string, string];
    const matches = options.get(school) ?? [];
    if (matches.length !== 1) throw new Error("first-grade-vacancies: school identity missing or ambiguous");
    let row = title.next;
    while (row && !(row.type === "tag" && row.attribs.class?.split(/\s+/u).includes("school-table-txt1"))) {
      if (row.type === "tag" && row.attribs.class?.split(/\s+/u).includes("school-district-title1")) throw new Error("first-grade-vacancies: school totals missing");
      row = row.next;
    }
    if (!row || row.type !== "tag") throw new Error("first-grade-vacancies: school totals missing");
    const values = DomUtils.getElementsByTagName("strong", row).map(elementText);
    if (values.length !== 3) throw new Error("first-grade-vacancies: school totals changed");
    const [schoolClasses, schoolPlaces, sopPlaces] = values.map((value, index) => positiveInteger(value, index === 2));
    if (sopPlaces! > schoolPlaces!) throw new Error("first-grade-vacancies: SOP places exceed total");
    schools.push({ schoolId: matches[0]!, school, district, schoolType, classes: schoolClasses!, places: schoolPlaces!, sopPlaces: sopPlaces! });
  }
  if (schools.length !== Math.min(count, 6)) throw new Error("first-grade-vacancies: result page is incomplete");
  return { count, year, ranking: match[1]!, classes, places, schools };
}

/** The public GET filters avoid Xajax pagination; all partitions must reconcile. */
export async function collectFirstGradeVacancies(baseHtml: string, load: (district: number, schoolType?: number) => Promise<string>): Promise<PilotSnapshot> {
  const base = parseFirstGradePage(baseHtml);
  if (base.count === 0 || base.count > 100) throw new Error("first-grade-vacancies: global school count outside pilot range");
  const collected: School[] = [];
  let partitionCount = 0;
  async function page(district: number, schoolType?: number): Promise<Page> {
    const result = parseFirstGradePage(await load(district, schoolType));
    if (result.year !== base.year || result.ranking !== base.ranking || (result.count > 0 && (result.classes !== base.classes || result.places !== base.places))) throw new Error("first-grade-vacancies: inconsistent global totals or ranking");
    for (const school of result.schools) {
      if (school.district !== districts[district] || (schoolType && school.schoolType !== schoolTypes[schoolType])) throw new Error("first-grade-vacancies: filter returned a different district or school type");
    }
    return result;
  }
  for (const district of Object.keys(districts).map(Number)) {
    const region = await page(district);
    partitionCount += region.count;
    if (region.count <= 6) { collected.push(...region.schools); continue; }
    let typeCount = 0;
    for (const schoolType of Object.keys(schoolTypes).map(Number)) {
      const filtered = await page(district, schoolType);
      if (filtered.count > 6) throw new Error("first-grade-vacancies: filtered page still needs pagination");
      typeCount += filtered.count;
      collected.push(...filtered.schools);
    }
    if (typeCount !== region.count) throw new Error("first-grade-vacancies: school types do not cover district");
  }
  if (partitionCount !== base.count || collected.length !== base.count
    || new Set(collected.map(school => school.schoolId)).size !== base.count
    || collected.reduce((sum, school) => sum + school.classes, 0) > base.classes
    || collected.reduce((sum, school) => sum + school.places, 0) !== base.places) {
    throw new Error("first-grade-vacancies: school rows do not reconcile with published totals");
  }
  const items = collected.sort((a, b) => a.district.localeCompare(b.district, "bg") || a.school.localeCompare(b.school, "bg"))
    .map(school => {
      const fields = { ...school, year: base.year, ranking: base.ranking };
      return { key: `${base.year}:${base.ranking}:${school.schoolId}`, sourceUrl: baseUrl, fields, fingerprint: createHash("sha256").update(JSON.stringify(fields)).digest("hex") };
    });
  return { sourceId: "first-grade-vacancies", items, completeness: "uncertain", limitations: ["The filtered school count and sum of published places reconcile with the source totals for the selected ranking; the global class count includes classes not present in the positive-vacancy list.", "The published count after a ranking is not a guarantee of a currently open admission place; removals and seasonal rollover need observation."] };
}
