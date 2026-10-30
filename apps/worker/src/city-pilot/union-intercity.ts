import { createHash } from "node:crypto";
import { DomUtils as D, parseDocument } from "htmlparser2";
import type { PilotSnapshot } from "./parse";

type Element = ReturnType<typeof D.getElementsByTagName>[number];
type Root = ReturnType<typeof parseDocument> | Element;
export type UnionIntercityRoute = { sourceId: string; destination: "Бургас" | "Варна"; destinationId: "23" | "29" };
const sourceUrl = "https://union-ivkoni.com/bg/routes";
const clean = (value: string) => value.replace(/\s+/gu, " ").trim();
const text = (node: Root) => clean(D.textContent(node));
const byClass = (node: Root, name: string) => D.findAll(element => element.attribs.class?.split(/\s+/u).includes(name) ?? false, node);
const fail = (reason: string): never => { throw new Error(`Union intercity: ${reason}`); };

function isoDay(value: string): string {
  if (!/^20\d{2}-\d{2}-\d{2}$/u.test(value)) return fail("invalid date");
  const parsed = new Date(`${value}T12:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) return fail("invalid date");
  return value;
}
function publishedDay(raw: string): string {
  const match = raw.match(/^(\d{2})-(\d{2})-(20\d{2})$/u);
  return isoDay(match ? `${match[3]}-${match[2]}-${match[1]}` : raw);
}
function onlyClass(root: Root, name: string): Element {
  const nodes = byClass(root, name);
  if (nodes.length !== 1) return fail(`missing or ambiguous ${name}`);
  return nodes[0]!;
}
function clock(raw: string): string {
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/u.test(raw)) return fail("invalid time");
  return raw;
}
function endpoint(row: Element, className: string, expectedCity: string) {
  const point = onlyClass(row, className);
  const city = onlyClass(point, "result-item-city");
  const breaks = city.children.map((node, index) => "name" in node && node.name === "br" ? index : -1).filter(index => index >= 0);
  if (breaks.length !== 1) return fail("city and station separator missing");
  const index = breaks[0]!;
  if (clean(D.textContent(city.children.slice(0, index))) !== expectedCity) return fail("course direction changed");
  const station = clean(D.textContent(city.children.slice(index + 1)));
  if (!station || station.length > 180 || /[\p{Cc}\p{Cf}<>]/u.test(station)) return fail("invalid station");
  return { station, date: publishedDay(text(onlyClass(point, "data-label"))), time: clock(text(onlyClass(point, "result-item-time"))) };
}

/** Parse only the public search result; this function never submits a selected course. */
export function parseUnionIntercity(html: string, route: UnionIntercityRoute, serviceDate: string): PilotSnapshot {
  const expected = route.destination === "Бургас"
    ? { sourceId: "union-plovdiv-burgas", destinationId: "23" }
    : route.destination === "Варна" ? { sourceId: "union-plovdiv-varna", destinationId: "29" } : null;
  if (!expected || route.sourceId !== expected.sourceId || route.destinationId !== expected.destinationId) return fail("unapproved route configuration");
  isoDay(serviceDate);
  if (Buffer.byteLength(html, "utf8") > 1_000_000) return fail("page exceeds parser limit");
  const dom = parseDocument(html);
  const forms = D.getElementsByTagName("form", dom).filter(node => node.attribs.action === sourceUrl && node.attribs.method?.toUpperCase() === "POST");
  if (forms.length !== 1) return fail("public search form changed");
  const form = forms[0]!;
  for (const [name, value] of [["from", "128"], ["to", route.destinationId]] as const) {
    const selects = D.getElementsByTagName("select", form).filter(node => node.attribs.name === name);
    if (selects.length !== 1) return fail("selected route missing");
    const options = D.getElementsByTagName("option", selects[0]!).filter(node => Object.hasOwn(node.attribs, "selected"));
    if (options.length !== 1 || options[0]!.attribs.value !== value) return fail("selected route differs from requested route");
  }
  const inputs = D.getElementsByTagName("input", form).filter(node => node.attribs.id === "dateStart" && node.attribs.name === "sdate");
  if (inputs.length !== 1 || publishedDay(inputs[0]!.attribs.value ?? "") !== serviceDate) return fail("selected date differs from requested date");
  const headings = byClass(dom, "result-title-text"), dates = byClass(dom, "results-title-date");
  const routeHeading = headings[0] ? text(headings[0]) : "";
  if (!new RegExp(`^Намерени билети:\\s*(?:\\d+\\s*)?Пловдив - ${route.destination}$`, "u").test(routeHeading)) return fail("result route heading changed");
  if (!dates[0] || publishedDay(text(dates[0])) !== serviceDate) return fail("result date differs from requested date");
  const boards = D.findAll(node => node.attribs.id === "lroutes-list", dom);
  if (boards.length !== 1) return fail("outbound listing missing or ambiguous");
  const rows = byClass(boards[0]!, "tickets-results-item");
  // No exact Union empty-state contract has been observed yet. Never accept a blank/challenge page as zero courses.
  if (!rows.length || rows.length > 100) return fail("course count outside parser limit; empty listing is not verified");
  const items: PilotSnapshot["items"] = [];
  const keys = new Set<string>();
  let transferRows = 0;
  for (const row of rows) {
    const departure = endpoint(row, "result-item-start-point-data", "Пловдив");
    const arrival = endpoint(row, "result-item-end-point-data", route.destination);
    if (departure.date !== serviceDate) return fail("course date differs from requested date");
    const interval = Date.parse(`${arrival.date}T${arrival.time}:00Z`) - Date.parse(`${departure.date}T${departure.time}:00Z`);
    if (interval <= 0 || interval > 86_400_000) return fail("invalid arrival interval");
    const labels = byClass(onlyClass(row, "result-item-duration"), "result-item-duration-label-title").map(text);
    const id = row.attribs.id ?? "";
    if (labels[0] === "с прекачване") {
      // The public page can contain a fully dated connection even when online purchase is unavailable.
      // Its two-leg ID and explicit connection labels establish an out-of-scope result, not an empty page.
      if (labels.length !== 3 || !/^време на изчакване в [^<>\p{Cc}\p{Cf}]{1,80}: \d{1,2}:[0-5]\d$/u.test(labels[1]!) || labels[2] !== "Продължителност"
        || !/^lroute-select-[1-9]\d{0,14}-128-[1-9]\d{0,14}-[1-9]\d{0,14}---[1-9]\d{0,14}-[1-9]\d{0,14}-[1-9]\d{0,14}-[1-9]\d{0,14}$/u.test(id)) return fail("unverified transfer row");
      transferRows++;
      continue;
    }
    const identity = id.match(/^lroute-select-([1-9]\d{0,14})-128-([1-9]\d{0,14})-([1-9]\d{0,14})$/u);
    if (labels.length !== 1 || labels[0] !== "директен" || !identity) return fail("invalid direct course identity or marker");
    const [, courseId, fromStation, toStation] = identity;
    const leg = `${courseId}-128-${fromStation}-${toStation}`;
    const links = byClass(row, "select-lroute");
    const attributed = D.findAll(node => ["data-id", "data-select-id", "data-leave", "data-arrive", "data-from", "data-to"].some(name => Object.hasOwn(node.attribs, name)), row);
    if (links.length > 1 || attributed.some(node => node !== links[0])) return fail("ambiguous course attributes");
    // Past courses retain the visible timetable and stable row ID but replace the purchase anchor with "заминал".
    // The anchor is optional; when present, every published attribute must still agree with the visible course.
    const link = links[0];
    if (link) {
      if (link.attribs["data-id"] !== courseId || link.attribs["data-from-station"] !== fromStation || link.attribs["data-to-station"] !== toStation
        || link.attribs["data-select-id"] !== leg || link.attribs["data-from"] !== "128" || link.attribs["data-to"] !== route.destinationId
        || link.attribs["data-multilink"] !== "0") return fail("course identity or direct route attributes disagree");
      if (link.attribs["data-leave"] !== `${departure.time}:00` || link.attribs["data-arrive"] !== `${arrival.time}:00`) return fail("visible and attributed times disagree");
    }
    const key = `${serviceDate}:${courseId}:128:${route.destinationId}:${fromStation}:${toStation}`;
    if (keys.has(key)) return fail("duplicate published leg");
    keys.add(key);
    const fields = {
      date: departure.date, time: departure.time, arrivalDate: arrival.date, arrivalTime: arrival.time,
      origin: "Пловдив", destination: route.destination, departureStation: departure.station, arrivalStation: arrival.station, publisher: "Юнион Ивкони",
    };
    items.push({ key, sourceUrl, fields, fingerprint: createHash("sha256").update(JSON.stringify(fields)).digest("hex") });
  }
  return {
    sourceId: route.sourceId, items, completeness: "uncertain",
    limitations: [
      "Only explicitly dated direct courses in the public Union Ivkoni search results for this requested leg and date; not complete operator or route coverage.",
      "Published local Europe/Sofia times are scheduled, not live arrivals. No seat, price, operating-carrier or booking guarantee is inferred.",
      "Station labels are preserved exactly, including distinct references to the North station and the stop outside it. Missing results are not proof of no buses.",
      ...(transferRows ? [`${transferRows} explicitly dated transfer result(s) were excluded from this direct-course adapter; an empty snapshot does not mean no buses operate.`] : []),
    ],
  };
}
