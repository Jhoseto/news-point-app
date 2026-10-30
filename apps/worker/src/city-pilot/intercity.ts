import { createHash } from "node:crypto";
import { DomUtils as D, parseDocument } from "htmlparser2";
import type { PilotSnapshot } from "./parse";

const sourceId = "karat-plovdiv-sofia";
const sourceUrl = "https://karat-s.com/bus/plovdiv-sofia";
type Element = ReturnType<typeof D.getElementsByTagName>[number];
type Root = ReturnType<typeof parseDocument> | Element;
const clean = (value: string) => value.replace(/\s+/gu, " ").trim();
const text = (node: Root) => clean(D.textContent(node));
const hasClass = (node: Element, name: string) => node.attribs.class?.split(/\s+/u).includes(name) ?? false;
const byClass = (node: Root, name: string) => D.findAll(element => hasClass(element, name), node);
const fail = (reason: string): never => { throw new Error(`Karat intercity: ${reason}`); };

function day(raw: string): string {
  const match = raw.match(/^(\d{2})-(\d{2})-(20\d{2})$/u);
  if (!match) return fail("invalid date");
  const value = `${match[3]}-${match[2]}-${match[1]}`;
  const parsed = new Date(`${value}T12:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) return fail("invalid date");
  return value;
}

function datedTime(raw: string): { date: string; time: string } {
  const match = raw.match(/^(\d{2}:[0-5]\d)\s*ч\.\s*(\d{2}-\d{2}-20\d{2})$/u);
  if (!match || Number(match[1]!.slice(0, 2)) > 23) return fail("invalid time or missing course date");
  return { date: day(match[2]!), time: match[1]! };
}

function station(heading: Element): string {
  if (!heading.parent) return fail("station missing");
  const names = D.getElementsByTagName("span", heading.parent).filter(node => hasClass(node, "small"));
  if (names.length !== 1) return fail("station missing");
  const match = text(names[0]!).match(/^\(([^()]+)\)$/u);
  const value = match?.[1];
  if (!value || value.length > 180 || /[\p{Cc}\p{Cf}<>]/u.test(value)) return fail("invalid station");
  return value;
}

/** A dated, potentially partial operator listing; never a recurring timetable. */
export function parseKaratPlovdivSofia(html: string): PilotSnapshot {
  if (Buffer.byteLength(html, "utf8") > 500_000) return fail("page exceeds parser limit");
  const dom = parseDocument(html);
  const headings = D.getElementsByTagName("h1", dom);
  if (headings.length !== 1 || text(headings[0]!) !== "Автобус Пловдив - София") return fail("route heading changed");
  const form = D.getElementById("search-form", dom);
  const board = D.getElementById("tickets-l", dom);
  if (!form || !board) return fail("dated listing missing");
  const dateInputs = D.getElementsByTagName("input", form).filter(node => node.attribs.name === "departure_date");
  const selectedDays = byClass(dom, "date-around-select").filter(node => hasClass(node, "active") && node.attribs["data-type"] === "l");
  if (dateInputs.length !== 1 || selectedDays.length !== 1) return fail("selected date missing or ambiguous");
  const selectedDate = day(dateInputs[0]!.attribs.value ?? "");
  if (day(selectedDays[0]!.attribs["data-date"] ?? "") !== selectedDate) return fail("selected dates disagree");
  const rows = byClass(board, "ticket-item");
  if (!rows.length || rows.length > 60) return fail("course count outside parser limit; empty listing is not proof of no buses");
  const keys = new Set<string>();
  const items: PilotSnapshot["items"] = [];
  for (const row of rows) {
    const ids = (row.attribs.class ?? "").split(/\s+/u).map(value => value.match(/^ticket-list-item-l-(\d{1,15})$/u)?.[1]).filter(Boolean);
    if (ids.length !== 1) return fail("published course identity missing");
    const info = byClass(row, "ticket-info");
    if (info.length !== 1) return fail("course information missing");
    const cities = D.getElementsByTagName("h4", info[0]!);
    if (cities.length !== 2 || text(cities[0]!) !== "Пловдив" || text(cities[1]!) !== "София") return fail("course direction changed");
    const labels = byClass(info[0]!, "small").filter(node => hasClass(node, "muted")).map(text);
    if (labels.join("|") !== "Тръгване|Продължителност|Пристигане") return fail("course time columns changed");
    const times = byClass(info[0]!, "bold");
    if (times.length !== 3) return fail("course times missing");
    const departure = datedTime(text(times[0]!)), arrival = datedTime(text(times[2]!));
    if (departure.date !== selectedDate) return fail("course date differs from selected date");
    const interval = Date.parse(`${arrival.date}T${arrival.time}:00Z`) - Date.parse(`${departure.date}T${departure.time}:00Z`);
    if (interval <= 0 || interval > 86_400_000) return fail("invalid arrival interval");
    const departureStation = station(cities[0]!), arrivalStation = station(cities[1]!);
    // A sold-out/closed-for-sale row can still publish a course without a buy link.
    const links = byClass(row, "select-lroute");
    if (links.length > 1) return fail("ambiguous course attributes");
    if (links[0]) {
      const expected = {
        id: ids[0]!, "departure-date": departure.date, "departure-time": `${departure.time}:00`,
        "arrival-date": arrival.date, "arrival-time": `${arrival.time}:00`,
        "city-from-name": "Пловдив", "city-to-name": "София",
        "station-from-name": departureStation, "station-to-name": arrivalStation,
      };
      for (const [name, value] of Object.entries(expected)) {
        if (clean(links[0].attribs[`data-${name}`] ?? "") !== value) return fail(`visible course and ${name} disagree`);
      }
    }
    const key = `${departure.date}:${ids[0]}`;
    if (keys.has(key)) return fail("duplicate published course");
    keys.add(key);
    const fields = {
      date: departure.date, time: departure.time, arrivalDate: arrival.date, arrivalTime: arrival.time,
      origin: "Пловдив", destination: "София", departureStation, arrivalStation, publisher: "Карат-С / Citylines",
    };
    items.push({ key, sourceUrl, fields, fingerprint: createHash("sha256").update(JSON.stringify(fields)).digest("hex") });
  }
  return {
    sourceId, items, completeness: "uncertain",
    limitations: [
      "Only explicitly dated courses published on the Karat-S / Citylines Plovdiv–Sofia page; the default selected date can be tomorrow.",
      "This publisher listing is not proof of complete route or operator coverage; absence is not proof of no buses.",
      "Published local Europe/Sofia times are scheduled, not live predictions. The publisher is not independent proof of the operating carrier or seat availability.",
    ],
  };
}
