import { createHash } from "node:crypto";
import { DomUtils, parseDocument } from "htmlparser2";

type Root = ReturnType<typeof parseDocument>;
type HtmlElement = ReturnType<typeof DomUtils.getElementsByTagName>[number];

export type PilotItem = {
  key: string;
  fingerprint: string;
  sourceUrl: string;
  // Fields are only pilot evidence. Nothing in this module is public content.
  fields: Record<string, string | number>;
};

export type PilotSnapshot = {
  sourceId: string;
  items: PilotItem[];
  completeness: "complete" | "uncertain";
  limitations: string[];
};

function hasClass(node: HtmlElement, className: string): boolean {
  return node.attribs.class?.split(/\s+/).includes(className) ?? false;
}

function allByClass(root: Root | HtmlElement, className: string): HtmlElement[] {
  return DomUtils.findAll((node) => hasClass(node, className), root);
}

function firstByClass(root: Root | HtmlElement, className: string): HtmlElement | undefined {
  return allByClass(root, className)[0];
}

function firstTag(root: Root | HtmlElement, tag: string): HtmlElement | undefined {
  return DomUtils.getElementsByTagName(tag, root)[0];
}

function clean(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

function text(root: Root | HtmlElement | undefined): string {
  return root ? clean(DomUtils.textContent(root)) : "";
}

function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function item(key: string, sourceUrl: string, fields: Record<string, string | number>, fingerprintFields: unknown = fields): PilotItem {
  if (!key || !sourceUrl) throw new Error("pilot item missing identity or source URL");
  return { key, sourceUrl, fields, fingerprint: digest(fingerprintFields) };
}

function absolute(path: string, base: string): string {
  return new URL(path, base).toString();
}

function unique(sourceId: string, items: PilotItem[], limitations: string[] = [], completeness: "complete" | "uncertain" = "uncertain"): PilotSnapshot {
  if (items.length === 0) throw new Error(`${sourceId}: no extractable rows; empty page is not proof of zero current records`);
  const keys = new Set<string>();
  for (const entry of items) {
    if (keys.has(entry.key)) throw new Error(`${sourceId}: duplicate key ${entry.key}`);
    keys.add(entry.key);
  }
  return { sourceId, items, completeness, limitations };
}

function parseVik(dom: Root): PilotSnapshot {
  const section = firstByClass(dom, "boxServiceContent");
  const date = text(section && firstByClass(section, "date"));
  const table = section && firstByClass(section, "accidents");
  const tbody = table && firstTag(table, "tbody");
  if (!/^\d{2}\.\d{2}\.\d{4}/u.test(date) || !tbody) throw new Error("vik-outages: dated accident table missing");
  const items: PilotItem[] = [];
  for (const row of DomUtils.getElementsByTagName("tr", tbody)) {
    const cells = DomUtils.getElementsByTagName("td", row).map((cell) => text(cell));
    if (cells.length !== 5) throw new Error("vik-outages: accident table schema changed");
    const [settlement, place, kind, affected, restoration] = cells;
    if (settlement !== "гр. Пловдив") continue;
    if (!place || !kind || !affected || !restoration) throw new Error("vik-outages: incomplete Plovdiv row");
    const key = digest([date, settlement, place, kind]);
    items.push(item(key, "https://www.vik.bg/bulletin/", { date, settlement, place, kind, affected, restoration }));
  }
  return unique("vik-outages", items, ["No source row ID or per-accident URL; identity is derived from date, place and kind.", "Removal from the daily table still needs observation before it can mean resolved."], "uncertain");
}

function parseDz(dom: Root): PilotSnapshot {
  const ranking = DomUtils.getElementById("sRankingId", dom);
  const selected = ranking && DomUtils.getElementsByTagName("option", ranking).find((option) => Object.hasOwn(option.attribs, "selected"));
  const rankingId = selected?.attribs.value;
  const results = DomUtils.getElementById("vacancies_result", dom);
  if (!rankingId || !results) throw new Error("dz-vacancies: ranking or result container missing");
  const items: PilotItem[] = [];
  for (const school of allByClass(results, "box-list-item")) {
    const link = DomUtils.findOne((node) => /\/school_details\/\d+/u.test(node.attribs.href ?? ""), school);
    const schoolId = link?.attribs.href?.match(/\/school_details\/(\d+)/u)?.[1];
    if (!schoolId || !link) throw new Error("dz-vacancies: school ID missing");
    for (const group of allByClass(school, "list-group-item")) {
      const ageGroup = text(firstTag(group, "h4"));
      const badges = allByClass(group, "badge--count");
      const total = Number(text(badges.at(-1)));
      if (!ageGroup || badges.length !== 4 || !Number.isSafeInteger(total) || total < 0) throw new Error("dz-vacancies: group total schema changed");
      items.push(item(`${rankingId}:${schoolId}:${ageGroup}`, link.attribs.href!, { rankingId, schoolId, school: text(link), ageGroup, total }));
    }
  }
  return unique("dz-vacancies", items, ["Default search shows only schools with available places; disappearance must not be interpreted as closure without another complete query."], "uncertain");
}

function parseCouncil(dom: Root): PilotSnapshot {
  const content = DomUtils.getElementById("content-bg", dom);
  if (!content || !/Дневен ред/u.test(text(content))) throw new Error("plovdiv-council: agenda content missing");
  const items: PilotItem[] = [];
  for (const row of DomUtils.getElementsByTagName("li", content)) {
    const title = text(row);
    const docket = title.match(/^([0-9]{2}[A-ZА-ЯІ]+-\d+)\s*\//u)?.[1];
    if (!docket) continue;
    // The source may mention private individuals. Retain only the docket and
    // a fingerprint of its text in the pilot journal.
    items.push(item(docket, "https://www.plovdiv.bg/общински-съвет/дневен-ред/", { docket }, title));
  }
  return unique("plovdiv-council", items, ["Agenda proposals are not adopted decisions; attachment availability varies.", "The source replaces the current agenda, so older meetings require a separate archive source."], "uncertain");
}

function parseOpera(dom: Root): PilotSnapshot {
  const items: PilotItem[] = [];
  for (const card of allByClass(dom, "event")) {
    if (!hasClass(card, "card") || !card.attribs["data-id"]) continue;
    const period = card.attribs["data-id"]!.match(/^(\d{4})-([A-Za-z]+)$/u);
    const rawDate = text(firstByClass(card, "date"));
    const parts = rawDate.match(/^(\d{1,2})\s*\/\s*(\d{1,2})$/u);
    const link = DomUtils.findOne((node) => /\/performance\/details\?id=\d+/u.test(node.attribs.href ?? ""), card);
    const title = text(firstByClass(card, "title"));
    const time = text(firstByClass(card, "time"));
    const location = text(firstByClass(card, "location"));
    if (!period || !parts || !link?.attribs.href || !title || !/^\d{2}:\d{2}$/u.test(time) || !location) throw new Error("plovdiv-opera: event card schema changed");
    const date = `${period[1]}-${parts[2]!.padStart(2, "0")}-${parts[1]!.padStart(2, "0")}`;
    const sourceUrl = absolute(link.attribs.href, "https://operaplovdiv.bg/");
    items.push(item(`${sourceUrl}:${date}:${time}`, sourceUrl, { title, date, time, location }));
  }
  return unique("plovdiv-opera", items, ["Listing changes and cancellations need repeated observation; the performance URL may be shared by several dates."], "uncertain");
}

function parseTheatre(dom: Root): PilotSnapshot {
  const table = DomUtils.getElementById("MainContent_grdPlan", dom);
  if (!table) throw new Error("plovdiv-theatre: public programme table missing");
  const items: PilotItem[] = [];
  for (const row of DomUtils.getElementsByTagName("tr", table).slice(1)) {
    const cells = DomUtils.getElementsByTagName("td", row);
    if (cells.length !== 3) throw new Error("plovdiv-theatre: programme table schema changed");
    const dateTime = text(cells[1]);
    const title = text(cells[2]);
    if (!/^\d{2}-\d{2}-\d{4} г\. \d{2}:\d{2} ч\.$/u.test(dateTime) || !title) throw new Error("plovdiv-theatre: incomplete programme row");
    items.push(item(`${dateTime}:${title}`, "https://tickets.dtp.bg/", { title, dateTime }));
  }
  return unique("plovdiv-theatre", items, ["Programme links lead to login, not public event details; no stable event ID was found."], "uncertain");
}

function parseClubCode(dom: Root): PilotSnapshot {
  const list = firstByClass(dom, "event-list");
  if (!list) throw new Error("club-code-upcoming: event list missing");
  const items: PilotItem[] = [];
  for (const card of allByClass(list, "card")) {
    if (!hasClass(card, "bg-dark") || !hasClass(card, "text-white")) continue;
    const link = DomUtils.findOne((node) => /[?&]eventid=\d+/u.test(node.attribs.href ?? ""), card);
    const titleNode = firstTag(card, "h3");
    const title = text(titleNode);
    const dateText = titleNode?.parent ? clean(DomUtils.textContent(titleNode.parent)).replace(title, "").trim() : "";
    const eventId = link?.attribs.href?.match(/[?&]eventid=(\d+)/u)?.[1];
    if (!eventId || !link?.attribs.href || !title || !dateText) throw new Error("club-code-upcoming: incomplete event card");
    items.push(item(eventId, absolute(link.attribs.href, "https://www.clubcode.bg/"), { title, dateText }));
  }
  return unique("club-code-upcoming", items, ["List date omits the year; details provide Event JSON-LD with year and time zone, but detail polling is not yet implemented.", "Ticket availability is not part of this pilot."], "uncertain");
}

export function parsePilotPage(sourceId: string, html: string): PilotSnapshot {
  const dom = parseDocument(html);
  switch (sourceId) {
    case "vik-outages": return parseVik(dom);
    case "dz-vacancies": return parseDz(dom);
    case "plovdiv-council": return parseCouncil(dom);
    case "plovdiv-opera": return parseOpera(dom);
    case "plovdiv-theatre": return parseTheatre(dom);
    case "club-code-upcoming": return parseClubCode(dom);
    default: throw new Error(`unsupported pilot source: ${sourceId}`);
  }
}
