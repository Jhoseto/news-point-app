import { eventImageUrl } from "./event-media";
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

function validCalendarDate(year: string, month: string, day: string): boolean {
  const date = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  const parsed = new Date(`${date}T12:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}

function text(root: Root | HtmlElement | undefined | null): string {
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

function parseMunicipalHousing(dom: Root): PilotSnapshot {
  const sourceId = "plovdiv-housing";
  const sourceUrl = "https://www.plovdiv.bg/uslugi/administrative-services/housingpolicy/";
  const content = DomUtils.getElementById("content", dom);
  if (!content || text(firstTag(content, "h1")) !== "ЖИЛИЩНО НАСТАНЯВАНЕ") throw new Error(`${sourceId}: housing page heading changed`);
  const paragraphs = DomUtils.getElementsByTagName("p", content)
    .filter(node => !hasClass(node, "pvc_stats"))
    .map(node => text(node));
  const starts = [
    paragraphs.findIndex(value => /^I\.\s*Съгласно чл\. 7/u.test(value)),
    paragraphs.findIndex(value => /^II\.\s*Чл\. 45/u.test(value)),
    paragraphs.findIndex(value => /^III\.\s*Съгласно чл\. 34/u.test(value)),
  ];
  if (starts.some(index => index < 0) || !(starts[0]! < starts[1]! && starts[1]! < starts[2]!)) throw new Error(`${sourceId}: three housing fund sections missing`);
  const sections = [
    { key: "rental", title: "Настаняване под наем", lines: paragraphs.slice(starts[0], starts[1]) },
    { key: "reserve", title: "Резервен фонд", lines: paragraphs.slice(starts[1], starts[2]) },
    { key: "staff", title: "Ведомствен фонд", lines: paragraphs.slice(starts[2]) },
  ];
  const required = [
    { count: 9, markers: [/фонд[\s„“"]+Настаняване под наем/u, /саморъчно подписана декларация/u, /комисия по чл\. 12/u] },
    { count: 3, markers: [/фонд[\s„“"]+Резервен/u, /5\s*\/пет\/\s*години/u, /съответния район/u] },
    { count: 2, markers: [/фонд[\s„“"]+Ведомствен/u, /декларацията по чл\. 35/u, /кмета на съответния район/u] },
  ];
  const records = sections.map((section, index) => {
    const body = section.lines.join("\n");
    const numbered = section.lines.filter(line => /^\d+\.\s*/u.test(line));
    if (numbered.length < required[index]!.count || required[index]!.markers.some(marker => !marker.test(body)) || body.length < 250 || body.length > 9000) {
      throw new Error(`${sourceId}: incomplete ${section.key} section`);
    }
    return item(section.key, sourceUrl, { title: section.title, intro: section.lines[0]!, body });
  });
  return unique(sourceId, records, [
    "This is the municipality's published housing guidance without a visible update date, not a check of the current ordinance or an eligibility decision.",
    "No available dwellings, waiting-list position or application outcome is published on this page.",
  ]);
}

function parseAirportFlights(dom: Root): PilotSnapshot {
  const sourceId = "plovdiv-airport-flights";
  const sourceUrl = "https://www.plovdivairport.com/poleti/razpisanie";
  const tables = DomUtils.getElementsByTagName("table", dom);
  if (tables.length !== 2) throw new Error(`${sourceId}: expected arrival and departure tables`);
  const entries: PilotItem[] = [];
  for (const [index, table] of tables.entries()) {
    const direction = index === 0 ? "arrival" : "departure";
    const expectedFirst = index === 0 ? "Час на пристигане" : "Час на заминаване";
    const headers = DomUtils.getElementsByTagName("th", table).map(cell => text(cell));
    if (headers.slice(0, 7).join("|") !== [expectedFirst, "Компания", "Полет", "Тип", index === 0 ? "От" : "За", "Статус", "Забележка"].join("|")) throw new Error(`${sourceId}: ${direction} columns changed`);
    const rows = DomUtils.getElementsByTagName("tr", table).slice(1);
    if (rows.length < 2 || rows.length > 100) throw new Error(`${sourceId}: ${direction} count outside observed range`);
    for (const row of rows) {
      const cells = DomUtils.getElementsByTagName("td", row).map(cell => text(cell));
      if (cells.length < 7 || cells.length > 8) throw new Error(`${sourceId}: ${direction} row changed`);
      const match = cells[0]?.match(/^(\d{2})\.(\d{2})\.(\d{4}) ([01]\d|2[0-3]):([0-5]\d)$/u);
      if (!match || !validCalendarDate(match[3]!, match[2]!, match[1]!)) throw new Error(`${sourceId}: invalid flight date`);
      const date = `${match[3]}-${match[2]}-${match[1]}`;
      const time = `${match[4]}:${match[5]}`;
      const flight = cells[2] ?? "";
      const route = cells[4] ?? "";
      const status = cells[5] ?? "";
      const note = cells[6] ?? "";
      if (!/^[A-Z0-9]{2,10}$/u.test(flight) || !route || route.length > 120 || !status || status.length > 50 || note.length > 100) throw new Error(`${sourceId}: incomplete ${direction} flight`);
      const fields: Record<string, string | number> = { direction, date, time, flight, route, status };
      if (note) fields.note = note;
      entries.push(item(`${direction}:${date}:${flight}`, sourceUrl, fields));
    }
  }
  return unique(sourceId, entries, [
    "This is the published airport board, not a guarantee of actual departure or arrival. Status can change after the last check.",
    "Only Plovdiv airport flights are covered; intercity buses and trains need separate sources. Historical rows disappearing are not proof of cancellation.",
  ]);
}

function parseEcoSignals(dom: Root): PilotSnapshot {
  const sourceId = "plovdiv-eco-signals";
  const sourceUrl = "https://www.plovdiv.bg/item/ecology/signals/";
  const content = DomUtils.getElementById("content", dom);
  if (!content || text(firstTag(content, "h1")) !== "Телефони за сигнали") throw new Error(`${sourceId}: official contact page missing`);
  const paragraphs = DomUtils.getElementsByTagName("p", content).map(paragraph => text(paragraph));
  const cleaningTopics = DomUtils.getElementsByTagName("li", content).map(line => text(line));
  if (cleaningTopics.length !== 3 || !cleaningTopics[0]?.includes("контейнери") || !cleaningTopics[1]?.includes("уличната мрежа") || !cleaningTopics[2]?.includes("дъждоприемни шахти")) throw new Error(`${sourceId}: cleaning topics changed`);
  const contacts = [
    { key: "inspectorate", label: "Общински инспекторат · зелен телефон", reason: "Нарушения на общинските наредби", marker: "Гореща линия на Пловдивски общински инспекторат", pattern: /\b\d-\d{3}\b/u },
    { key: "riosv", label: "РИОСВ Пловдив", reason: "Нарушения на екологичното законодателство", marker: "РИОСВ Пловдив „зелен“ телефон", pattern: /\b032\s*\d{3}\s*\d{3}\b/u },
    { key: "basin", label: "Басейнова дирекция ИБР", reason: "Нарушения на Закона за водите", marker: "Басейнова дирекция ИБР „син“ телефон", pattern: /\b032\s*\d{3}\s*\d{3}\b/u },
    { key: "animals", label: "ОП „Зооветеринарен комплекс“", reason: "Безстопанствени кучета и котки", marker: "ОП „Зооветеринарен комплекс“", pattern: /\b032\s*\d{3}\s*\d{3}\b/u },
    { key: "trees", label: "ОП „Градини и паркове“", reason: "Паднали дървета и опасни клони", marker: "ОП „Градини и паркове“", pattern: /\b032\s*\d{3}\s*\d{3}\b/u },
    { key: "cleaning", label: "ОП „Чистота“", reason: "Контейнери, почистване и дъждоприемни шахти", marker: "ОП „Чистота“", pattern: /\b032\s*\d{3}\s*\d{3}\b/u },
    { key: "disinfection", label: "ОП „Дезинфекционна станция“", reason: "Заявки за дезинфекция, дезинсекция и дератизация", marker: "ОП „Дезинфекционна станция“", pattern: /\b032\s*\d{3}\s*\d{3}\b/u },
  ];
  const entries = contacts.map(contact => {
    const matching = paragraphs.filter(paragraph => paragraph.includes(contact.marker));
    const phone = matching.length === 1 ? matching[0]!.match(contact.pattern)?.[0] : undefined;
    if (!phone) throw new Error(`${sourceId}: missing or changed ${contact.key} phone`);
    return item(contact.key, sourceUrl, { label: contact.label, reason: contact.reason, phone: clean(phone) });
  });
  return unique(sourceId, entries, [
    "The municipality publishes these destinations and phone numbers without a visible last-review date; a successful recheck does not prove that calls are answered.",
    "The page does not provide a case-submission status or opening hours. Protected email addresses are deliberately not extracted.",
  ]);
}

function parseTransportSignals(dom: Root): PilotSnapshot {
  const sourceId = "plovdiv-transport-signals";
  const sourceUrl = "https://www.plovdiv.bg/administration/municipal-enterprises/transport/";
  const content = DomUtils.getElementById("content", dom);
  if (!content || !/^ОП „Организация и контрол по транспорта/u.test(text(firstTag(content, "h1")))) throw new Error(`${sourceId}: operator page heading changed`);
  const paragraphs = DomUtils.getElementsByTagName("p", content);
  const contactIndex = paragraphs.findIndex(paragraph => text(paragraph) === "Контакти:");
  const numbers = contactIndex >= 0 ? text(paragraphs[contactIndex + 1]) : "";
  const contacts = [
    { key: "buses", label: "Градски транспорт", reason: "Сигнали за градския транспорт", marker: "Градски транспорт" },
    { key: "traffic", label: "Център за управление на трафика", reason: "Сигнали за светофарни уредби", marker: "Център за управление на трафика" },
    { key: "lighting", label: "Улично осветление", reason: "Сигнали за улично осветление", marker: "Улично осветление" },
  ];
  const records = contacts.map(contact => {
    const phone = numbers.match(new RegExp(`(032\\/[0-9]{3}[- ][0-9]{3})\\s*–\\s*${contact.marker}`, "u"))?.[1];
    if (!phone) throw new Error(`${sourceId}: missing or changed ${contact.key} contact`);
    return item(contact.key, sourceUrl, { label: contact.label, reason: contact.reason, phone });
  });
  return unique(sourceId, records, ["Phone numbers are published on the municipal operator page; opening hours and actual phone availability are not verified."]);
}

function parseSocialServices(dom: Root): PilotSnapshot {
  const sourceId = "plovdiv-social-services";
  const table = DomUtils.getElementById("servicesTable", dom);
  const body = DomUtils.getElementById("tableBody", dom);
  if (!table || !body || !text(firstTag(dom, "h1")).includes("Каталог на социалните услуги")) throw new Error(`${sourceId}: official catalog structure missing`);
  const headers = DomUtils.getElementsByTagName("th", table).map(cell => text(cell));
  if (headers.join("|") !== "№|Център за социални услуги|Адрес|Телефон|Електронна поща|Социални услуги|Информация за услугата|Капацитет") throw new Error(`${sourceId}: catalog columns changed`);
  const rows = DomUtils.getElementsByTagName("tr", body).filter(row => hasClass(row, "data-row"));
  if (rows.length < 50 || rows.length > 150) throw new Error(`${sourceId}: row count outside observed range`);
  const entries = rows.map((row, index) => {
    const cells = DomUtils.getElementsByTagName("td", row);
    if (cells.length !== 8 || text(cells[0]) !== String(index + 1)) throw new Error(`${sourceId}: row numbering or columns changed`);
    const [number, name, address, phone, , services, description, capacity] = cells.map(cell => text(cell));
    if (!number || !name || !services || !description || name.length > 250 || description.length > 3000) throw new Error(`${sourceId}: required service details missing`);
    const fields: Record<string, string | number> = { name, services, description };
    if (address && address !== "-") fields.address = address;
    if (phone && phone !== "-") fields.phone = phone;
    if (capacity && capacity !== "-") fields.capacity = capacity;
    // Row numbers can shift; identical service names may have separate addresses.
    return item(`${name}|${address}`, "https://www.plovdiv.bg/wp-content/uploads/2026/10/SotsialniUslugi.html", fields);
  });
  return unique(sourceId, entries, ["This is a published service directory, not proof of present availability, capacity occupancy or eligibility.", "Phone and address may change; publication date and the next catalog URL still need observation. Protected email addresses are not extracted."]);
}

function parseBulkyWaste(dom: Root): PilotSnapshot {
  const sourceId = "chistota-bulky-waste";
  const sourceUrl = "https://chistota-plovdiv.com/пловдивчани-изхвърлят-едрогабаритни/";
  const article = allByClass(dom, "elementor-widget-theme-post-content")[0];
  const published = text(firstTag(dom, "time"));
  if (!article || !text(firstTag(dom, "h1")).includes("едрогабаритни отпадъци") || !/^\d{1,2} [а-я]+, 20\d{2}$/u.test(published)) throw new Error(`${sourceId}: article or publication date missing`);
  const paragraphs = DomUtils.getElementsByTagName("p", article);
  const pickup = paragraphs.find(paragraph => text(paragraph).startsWith("Желаещите могат да подадат заявка"));
  const exclusions = paragraphs.find(paragraph => text(paragraph).startsWith("Важно е да се знае"));
  const pickupPhone = pickup && DomUtils.findOne(node => node.attribs.href === "tel:032675817", pickup);
  if (!pickup || !exclusions || !pickupPhone || !text(pickup).includes("032/675 817") || !text(exclusions).includes("строителни отпадъци")) throw new Error(`${sourceId}: pickup conditions changed`);
  const items = [item("pickup", sourceUrl, { kind: "pickup", label: "Извозване по заявка", phone: "032/675 817", instruction: text(pickup), exclusions: text(exclusions), published })];
  const expected = new Set(["Южен", "Северен", "Източен", "Централен", "Западен", "Тракия"]);
  for (const paragraph of paragraphs) {
    const strong = firstTag(paragraph, "strong");
    const match = text(strong).match(/^Район (Южен|Северен|Източен|Централен|Западен|Тракия)$/u);
    if (!match) continue;
    const district = match[1]!;
    if (!expected.delete(district)) throw new Error(`${sourceId}: duplicate district`);
    const segments: string[] = [];
    let current = "";
    for (const child of paragraph.children) {
      if (child.type === "tag" && child.name === "br") { segments.push(clean(current)); current = ""; }
      else current += DomUtils.textContent(child);
    }
    segments.push(clean(current));
    if (segments.length !== 5 || segments[0] !== `Район ${district}` || !segments[1]?.includes("гр. Пловдив")
      || !segments[2]?.includes("тел.") || segments[3] !== "Отпадъци, които се събират на площадката:"
      || !segments[4]?.includes("едрогабаритни отпадъци")) throw new Error(`${sourceId}: district detail changed`);
    items.push(item(`district:${district}`, sourceUrl, { kind: "site", label: `Площадка · ${district}`, district, address: segments[1]!, contact: segments[2]!, accepted: segments[4]!, published }));
  }
  if (expected.size) throw new Error(`${sourceId}: district missing: ${[...expected].join(", ")}`);
  return unique(sourceId, items, ["The operator article was published in 2025; present operation, access conditions and current phone availability are not verified by this page alone.", "Call before visiting a site. Published accepted waste types are not a live acceptance guarantee."]);
}

export function parseEcomapContainers(json: string): PilotSnapshot {
  const sourceId = "ecomap-containers";
  const sourceUrl = "https://ecomap.plovdiv.bg/";
  const parsed: unknown = JSON.parse(json);
  if (!Array.isArray(parsed) || parsed.length < 1500 || parsed.length > 2500) throw new Error(`${sourceId}: city container count outside observed range`);
  const types = new Set(["yellow", "blue", "green", "brown", "tekstil", "nuba"]);
  const entries = parsed.map((raw: unknown) => {
    if (!raw || typeof raw !== "object") throw new Error(`${sourceId}: invalid container record`);
    const row = raw as Record<string, unknown>;
    const id = row.id;
    const latitude = Number(row.latitude);
    const longitude = Number(row.longitude);
    const type = row.type;
    const address = row.address;
    if (!Number.isSafeInteger(id) || Number(id) <= 0 || typeof type !== "string" || !types.has(type)
      || typeof address !== "string" || !address.trim() || address.length > 250
      || !Number.isFinite(latitude) || latitude < 42.07 || latitude > 42.23
      || !Number.isFinite(longitude) || longitude < 24.58 || longitude > 24.91) throw new Error(`${sourceId}: incomplete or out-of-bounds container`);
    if (row.description !== null && row.description !== undefined && typeof row.description !== "string") throw new Error(`${sourceId}: invalid description`);
    const description = typeof row.description === "string" ? text(parseDocument(row.description)) : "";
    if (description.length > 500) throw new Error(`${sourceId}: description too long`);
    const fields: Record<string, string | number> = { type, address: clean(address), latitude, longitude };
    if (description) fields.description = description;
    return item(String(id), sourceUrl, fields);
  });
  return unique(sourceId, entries, [
    "The API returns map points and collection types, not the condition, capacity, opening hours or guaranteed present operation of each container.",
    "The six observed types cover street containers; dedicated collection sites and their accepted waste require another source.",
    "City bounds were compared with two half-city queries on 2026-10-25; repeated completeness and removal behaviour remain unproven.",
  ]);
}

export function parseEcomapCollectionEvents(json: string): PilotSnapshot {
  const sourceId = "ecomap-collection-events";
  const sourceUrl = "https://ecomap.plovdiv.bg/";
  const parsed: unknown = JSON.parse(json);
  if (!Array.isArray(parsed) || parsed.length < 4 || parsed.length > 100) throw new Error(`${sourceId}: calendar response outside observed range`);
  const entries: PilotItem[] = [];
  for (const raw of parsed) {
    if (!raw || typeof raw !== "object") throw new Error(`${sourceId}: invalid calendar record`);
    const row = raw as Record<string, unknown>;
    if (typeof row.title !== "string" || !row.title.startsWith("Кампания за ")) continue;
    const date = row.start;
    const id = row.id;
    const props = row.extendedProps;
    const html = props && typeof props === "object" ? (props as Record<string, unknown>).description : undefined;
    const validDate = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/u.test(value)
      && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;
    if ((typeof id !== "string" && typeof id !== "number") || !String(id) || !validDate(date)
      || (row.end !== null && row.end !== undefined && (!validDate(row.end) || row.end <= date))
      || typeof html !== "string" || html.length > 4000) throw new Error(`${sourceId}: incomplete campaign`);
    const paragraphs = DomUtils.getElementsByTagName("p", parseDocument(html)).map(paragraph => text(paragraph)).filter(Boolean);
    const details = paragraphs.join(" • ");
    if (!paragraphs.length || !/\d{2}:\d{2}/u.test(details) || details.length > 2500) throw new Error(`${sourceId}: campaign has no usable time and place`);
    entries.push(item(String(id), sourceUrl, { title: row.title, date, details }));
  }
  return unique(sourceId, entries, [
    "Only calendar entries explicitly titled as collection campaigns with a dated schedule and time are extracted; awareness days are excluded.",
    "Published dates and places are not proof that a future campaign will take place. Removal or editing still needs repeated observation and a cancellation signal.",
    "The calendar description may contain multiple locations for one date; it is preserved as published text rather than inventing individual event IDs.",
  ]);
}

function parseParkingOperator(dom: Root): PilotSnapshot {
  const sourceId = "plovdiv-parking-operator";
  const sourceUrl = "https://www.plovdiv.bg/administration/municipal-enterprises/op_parking/";
  if (!DomUtils.getElementsByTagName("h1", dom).some(heading => text(heading) === "ОП „Паркиране и репатриране“")) throw new Error(`${sourceId}: operator page title changed`);
  const paragraphs = DomUtils.getElementsByTagName("p", dom).map(text);
  const addressLine = paragraphs.find(line => line.includes("ул. „Хр. Г. Данов“ № 28"));
  const contacts = paragraphs.find(line => line.includes("Информация:") && line.includes("Кол Център Скоби"));
  const dispatcher = paragraphs.find(line => line.includes("Наказателен паркинг диспечер"));
  const cashHours = DomUtils.getElementsByTagName("h3", dom).map(text).find(line => line.includes("последен работен ден"));
  const infoPhone = contacts?.match(/Информация:\s*(\d{3}\/\d{3}-\d{3})/u)?.[1];
  const clampPhone = contacts?.match(/Кол Център Скоби\s*[–-]\s*(\d{4}\s+\d{3}\s+\d{3})/u)?.[1];
  const dispatchPhone = dispatcher?.match(/диспечер\s*[-–]\s*(\d{10})/u)?.[1];
  if (!addressLine || !infoPhone || !clampPhone || !dispatchPhone || !cashHours || !cashHours.includes("12:00")) throw new Error(`${sourceId}: published contact or office detail missing`);
  return unique(sourceId, [
    item("information", sourceUrl, { label: "Информация за паркиране", phone: infoPhone }),
    item("clamps", sourceUrl, { label: "Кол център · скоби", phone: clampPhone }),
    item("towing", sourceUrl, { label: "Наказателен паркинг · диспечер", phone: dispatchPhone }),
    item("office", sourceUrl, { label: "Офис на предприятието", address: "ул. „Хр. Г. Данов“ № 28", note: cashHours }),
  ], ["These are published operator contacts, not a live service-status or response-time guarantee.", "The page does not enumerate municipal car parks or available spaces. The last-working-day cash-desk note is not a full opening-hours schedule."]);
}

function parseMunicipalSchools(dom: Root): PilotSnapshot {
  const sourceId = "plovdiv-municipal-schools";
  const sourceUrl = "https://www.plovdiv.bg/item/education/secondary-education/schools/municipal-schools/";
  const content = DomUtils.getElementById("content", dom);
  if (!content || text(firstTag(content, "h1")) !== "Общински училища") throw new Error(`${sourceId}: directory heading missing`);
  const tables = DomUtils.getElementsByTagName("table", content);
  const groups = [
    { type: "Начално училище", rows: 4 },
    { type: "Основно училище", rows: 21 },
    { type: "Обединено училище", rows: 2 },
    { type: "Средно училище", rows: 18 },
    { type: "Профилирана гимназия", rows: 5 },
    { type: "Професионална гимназия", rows: 2 },
  ];
  if (tables.length !== groups.length) throw new Error(`${sourceId}: school groups changed`);
  const entries: PilotItem[] = [];
  for (const [index, table] of tables.entries()) {
    const group = groups[index]!;
    const rows = DomUtils.getElementsByTagName("tr", table);
    const firstCells = DomUtils.getElementsByTagName("td", rows[0]!);
    const hasHeader = firstCells.map(text).join("|").replace(/^\s*/u, "") === "Наименование|Район|Адрес|Телефон";
    if (index !== 2 && index !== 5 && !hasHeader) throw new Error(`${sourceId}: ${group.type} columns changed`);
    if ((index === 2 || index === 5) && hasHeader) throw new Error(`${sourceId}: ${group.type} header changed`);
    const dataRows = hasHeader ? rows.slice(1) : rows;
    if (dataRows.length !== group.rows) throw new Error(`${sourceId}: ${group.type} row count changed`);
    for (const row of dataRows) {
      const cells = DomUtils.getElementsByTagName("td", row);
      if (cells.length !== 4) throw new Error(`${sourceId}: school columns changed`);
      // The first cell often appends a linked school URL, sometimes inside
      // the same nested <b> as the name. Strip its text from the first <h5>.
      const heading = firstTag(cells[0]!, "h5");
      let nameText = text(heading);
      for (const link of heading ? DomUtils.getElementsByTagName("a", heading) : []) nameText = nameText.replace(text(link), "");
      const name = clean(nameText);
      const district = text(cells[1]);
      const address = text(cells[2]);
      const phone = text(cells[3]);
      if (!name || !["Централен", "Източен", "Западен", "Южен", "Северен", "Тракия"].includes(district)
        || !address || !/^\d{3}[-\s]\d{3}$/u.test(phone)) throw new Error(`${sourceId}: incomplete school contact`);
      entries.push(item(`${name}|${district}`, sourceUrl, { name, type: group.type, district, address, phone }));
    }
  }
  return unique(sourceId, entries, [
    "The municipal page has no visible publication or review date. A successful recheck proves only that it still publishes these contacts, not that all are current.",
    "It lists municipal schools only; kindergarten, state and private school directories require separate sources. Name and district form a derived key.",
  ]);
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

function parseEvnHeatingOutages(dom: Root): PilotSnapshot {
  const sourceId = "evn-heating-outages";
  const sourceUrl = "https://www.evn.bg/Home/Heating.aspx";
  const section = DomUtils.getElementById("planned-repairs", dom);
  const active = DomUtils.getElementById("ctl00_cphHeader_cphBodyContent_HeatingPlaningOutage_pnlOutagesYes", dom);
  const planned = DomUtils.getElementById("ctl00_cphHeader_cphBodyContent_HeatingPlaningOutage_Panel1", dom);
  const outInfo = text(DomUtils.getElementById("ctl00_cphHeader_cphBodyContent_HeatingPlaningOutage_lblOut", dom));
  const plannedInfo = text(DomUtils.getElementById("ctl00_cphHeader_cphBodyContent_HeatingPlaningOutage_lblPlaningInfo", dom));
  if (!section || !active || !planned || !text(firstTag(section, "h2")).includes("Планирани прекъсвания и аварии")) throw new Error(`${sourceId}: outage section changed`);
  const entries: PilotItem[] = [];
  const readRows = (panel: HtmlElement, kind: "fault" | "planned") => {
    const cards = allByClass(panel, "faq-wrap");
    if (cards.length > 30) throw new Error(`${sourceId}: outage count outside expected range`);
    for (const card of cards) {
      const rows = allByClass(card, "faq-row");
      const details = new Map(rows.map(row => {
        const heading = firstTag(row, "h3") ?? firstTag(row, "h4");
        const content = firstTag(row, "p");
        return [text(heading).replace(/:$/u, ""), text(content)] as const;
      }));
      const address = details.get("Адрес") ?? "";
      const issue = details.get("Неизправност") ?? "";
      const start = details.get("Дата на изключване от") ?? "";
      const end = details.get("Дата на изключване до") ?? "";
      const deadline = details.get("Срок на изключването до") ?? "";
      const validDateTime = (value: string) => {
        const match = value.match(/^(\d{2})\.(\d{2})\.(\d{4}) ([01]\d|2[0-3]):([0-5]\d):([0-5]\d)$/u);
        return !!match && validCalendarDate(match[3]!, match[2]!, match[1]!);
      };
      if (!address || !issue || !validDateTime(start) || !validDateTime(end) || !validDateTime(deadline) || rows.length !== 5) throw new Error(`${sourceId}: incomplete ${kind} outage row`);
      entries.push(item(digest([kind, address, start]), sourceUrl, { kind, address, issue, start, end, deadline }));
    }
    return cards.length;
  };
  const faults = readRows(active, "fault");
  const plans = readRows(planned, "planned");
  if (!faults && !/В момента няма|Няма известни/u.test(outInfo)) throw new Error(`${sourceId}: empty fault panel without explicit empty state`);
  if (!plans && !/В момента няма планирани изключвания/u.test(plannedInfo)) throw new Error(`${sourceId}: empty planned panel without explicit empty state`);
  const limitations = ["The source calls faults currently known, but the published end/deadline is not a confirmed restoration time.", "An item disappearing from the source is not independent proof that heat has been restored; address/start form a derived key."];
  return entries.length ? unique(sourceId, entries, limitations) : { sourceId, items: [], completeness: "uncertain", limitations };
}

function parseParkingRules(dom: Root): PilotSnapshot {
  const content = firstByClass(dom, "post-content");
  if (!content) throw new Error("plovdiv-parking-rules: article content missing");
  const paragraphs = DomUtils.getElementsByTagName("p", content).map(text);
  const payment = paragraphs.find(value => /кратък номер\s+1332/u.test(value));
  const rate = paragraphs.find(value => /Стойността на самия SMS/u.test(value));
  const hours = paragraphs.find(value => /Синя зона.*работи и в събота/u.test(value));
  const greenAccess = paragraphs.find(value => /постоянна адресна регистрация в обхвата на зоната/u.test(value));
  const greenArea = paragraphs.find(value => /Зоната се намира в кв\. „Капана“/u.test(value));
  const number = payment?.match(/кратък номер\s+(\d{4})/u)?.[1];
  const price = rate?.match(/(\d+,\d{2})\s*евро/u)?.[1];
  const timeRange = hours?.match(/от\s*(\d{1,2}:\d{2})\s*до\s*(\d{1,2}:\d{2})/u);
  if (!number || !price || !timeRange || !greenAccess || !greenArea) throw new Error("plovdiv-parking-rules: required rule changed or disappeared");
  const url = "https://www.plovdiv.bg/sms-parking/";
  return unique("plovdiv-parking-rules", [
    item("sms-number", url, { topic: "Синя и зелена зона", label: "SMS за Синя зона", value: number, detail: "Изпраща се регистрационният номер на автомобила." }),
    item("sms-price", url, { topic: "Синя и зелена зона", label: "Посочена стойност на SMS", value: `${price} евро`, detail: "Добавя се цената на съобщението според мобилния оператор." }),
    item("blue-hours", url, { topic: "Синя и зелена зона", label: "Синя зона, включително събота", value: `${timeRange[1]}–${timeRange[2]}`, detail: "Източникът посочва този диапазон и за събота; не потвърждава тук всички изключения." }),
    item("green-area", url, { topic: "Синя и зелена зона", label: "Зелена зона", value: "Капана", detail: greenArea }),
    item("green-access", url, { topic: "Синя и зелена зона", label: "Паркиране в Зелена зона", value: "Постоянен адрес в зоната", detail: greenAccess }),
  ], ["Rules are copied from one municipal page; temporary exceptions and parking availability are not covered.", "No assumption about Sundays or public holidays."], "uncertain");
}

function parseTransitFares(dom: Root): PilotSnapshot {
  const fareTable = DomUtils.getElementsByTagName("table", dom).find(table => /Цените на превозни документи/u.test(text(firstTag(table, "thead"))));
  const body = fareTable && firstTag(fareTable, "tbody");
  if (!body) throw new Error("plovdiv-transit: ticket price table missing");
  const items: PilotItem[] = [];
  for (const row of DomUtils.getElementsByTagName("tr", body)) {
    const cells = DomUtils.getElementsByTagName("td", row);
    const number = text(cells[0]);
    if (!/^\d+$/u.test(number) || Number(number) > 18) continue;
    const label = text(cells[1]);
    const euro = text(cells[3]).match(/(\d+[.,]\d{2})\s*€/u)?.[1];
    if (cells.length !== 4 || !label || !euro) throw new Error("plovdiv-transit: incomplete ticket price row");
    items.push(item(`fare-${number}`, "https://www.plovdiv.bg/item/transport/mass-public-transport/", { label, price: `${euro.replace(".", ",")} евро` }));
  }
  if (items.length !== 18) throw new Error("plovdiv-transit: expected ticket price rows changed");
  return unique("plovdiv-transit", items, ["These are prices stated on the municipality's transport page; temporary changes and ticket availability need separate checks.", "Route PDF schedules, live positions and the unpriced irregular-passenger fare row are not extracted."], "uncertain");
}

function parseLowEmissionZone(dom: Root): PilotSnapshot {
  const content = DomUtils.getElementById("content", dom);
  const article = content && firstByClass(content, "anons");
  if (!article) throw new Error("plovdiv-low-emission: municipal article missing");
  const paragraphs = DomUtils.getElementsByTagName("p", article).map(text);
  const season = paragraphs.find(value => /Ограничението ще се прилага ежегодно/u.test(value));
  const area = paragraphs.find(value => /Зона „Малък ринг“ обхваща/u.test(value));
  const unknownGroup = paragraphs.find(value => /няма данни за екологична категория/u.test(value));
  const access = paragraphs.find(value => /Право на навлизане и движение в зоната/u.test(value));
  const permit = paragraphs.find(value => /Пропускът се издава за срок/u.test(value));
  const boulevards = [...(area?.matchAll(/бул\.\s*„([^“]+)“/gu) ?? [])].map(match => match[1]!);
  if (!season?.includes("от 1 октомври до 30 април") || !season.includes("първа и втора екологична група")
    || boulevards.length !== 4 || !unknownGroup || !access || !permit
    || !/до една година/u.test(permit) || !/едно МПС на жилище/u.test(permit)) {
    throw new Error("plovdiv-low-emission: required municipal rule changed or disappeared");
  }
  const url = "https://www.plovdiv.bg/zona-s-niska-emisia/";
  const topic = "Влизане в центъра";
  return unique("plovdiv-low-emission", [
    item("season", url, { topic, label: "Период на ограниченията", value: "1 октомври – 30 април", detail: season }),
    item("boundary", url, { topic, label: "Граници на Малкия ринг", value: boulevards.join(" · "), detail: area! }),
    item("groups", url, { topic, label: "Посочени екологични групи", value: "1 и 2", detail: season }),
    item("unknown-group", url, { topic, label: "Без данни за екологична категория", value: "Не се считат за нарушители", detail: unknownGroup }),
    item("resident-access", url, { topic, label: "Достъп за живущи и исторически МПС", value: "При условия и заявление", detail: `${access} ${permit}` }),
  ], ["This extracts one municipal information article, not the current legal text or a vehicle eligibility decision.", "Later temporary suspensions, permit status and live enforcement are not established by this page."], "uncertain");
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

function parseDzInstitutions(dom: Root): PilotSnapshot {
  const sourceId = "dz-institutions";
  const sourceUrl = "https://dz-priem.plovdiv.bg/schools";
  const districts = [
    ["Централен", 22], ["Северен", 13], ["Източен", 11],
    ["Южен", 18], ["Западен", 11], ["Тракия", 13],
  ] as const;
  const boxes = allByClass(dom, "box-list-item");
  if (boxes.length !== districts.length || !text(firstTag(dom, "h1")).includes("Детски заведения")) throw new Error(`${sourceId}: district directory changed`);
  const entries: PilotItem[] = [];
  for (const [index, box] of boxes.entries()) {
    const [district, expectedRows] = districts[index]!;
    if (text(firstTag(box, "h2")) !== `Район "${district}"`) throw new Error(`${sourceId}: district heading changed`);
    const table = firstTag(box, "table");
    const header = table && firstTag(table, "thead");
    const body = table && firstTag(table, "tbody");
    if (!table || !header || !body || !table.attribs["aria-label"]?.includes(district)
      || DomUtils.getElementsByTagName("th", header).map(text).join("|") !== "Детско заведение|Адрес|Телефон|Брой свободни места") throw new Error(`${sourceId}: ${district} columns changed`);
    const rows = DomUtils.getElementsByTagName("tr", body);
    if (rows.length !== expectedRows) throw new Error(`${sourceId}: ${district} row count changed`);
    for (const row of rows) {
      const cells = DomUtils.getElementsByTagName("td", row);
      if (cells.length !== 4) throw new Error(`${sourceId}: row columns changed`);
      const link = firstTag(cells[0]!, "a");
      const id = link?.attribs.href?.match(/^https:\/\/dz-priem\.plovdiv\.bg\/school_details\/(\d+)$/u)?.[1];
      const name = text(link);
      const address = text(cells[1]);
      const phone = text(cells[2]);
      const type = name.startsWith("ДГ ") ? "Детска градина" : name.startsWith("ДЯ ") ? "Детска ясла" : "";
      if (!id || !name || !type || !address.startsWith(`${district}, `) || !phone || phone.length > 70) throw new Error(`${sourceId}: incomplete institution contact`);
      entries.push(item(id, sourceUrl, { institutionId: id, name, type, district, address, phone }));
    }
  }
  return unique(sourceId, entries, [
    "This is the public municipal kindergarten/nursery directory, not proof of current admission places or immediate phone availability.",
    "Site IDs identify separate buildings, including second addresses. A missing row is not proof that a site closed; observe changes over time.",
  ]);
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
  const photographs = new Map<string, string>();
  for (const card of allByClass(dom, "event")) {
    const link = DomUtils.findOne(node => /\/performance\/details\?id=\d+/u.test(node.attribs.href ?? ""), card);
    const photo = eventImageUrl(firstTag(firstByClass(card, "main-img") ?? card, "img")?.attribs.src, "https://operaplovdiv.bg/");
    if (link && photo) photographs.set(absolute(link.attribs.href!, "https://operaplovdiv.bg/"), photo);
  }
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
    if (!period || !parts || !validCalendarDate(period[1]!, parts[2]!, parts[1]!) || !link?.attribs.href || !title || !/^(?:[01]\d|2[0-3]):[0-5]\d$/u.test(time) || !location) throw new Error("plovdiv-opera: event card schema changed");
    const date = `${period[1]}-${parts[2]!.padStart(2, "0")}-${parts[1]!.padStart(2, "0")}`;
    const sourceUrl = absolute(link.attribs.href, "https://operaplovdiv.bg/");
    const image = eventImageUrl(firstTag(firstByClass(card, "main-img") ?? card, "img")?.attribs.src, sourceUrl) ?? photographs.get(sourceUrl);
    items.push(item(`${sourceUrl}:${date}:${time}`, sourceUrl, { title, date, time, location, ...(image ? { imageUrl: image } : {}) }));
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
    const parts = dateTime.match(/^(\d{2})-(\d{2})-(\d{4}) г\. ((?:[01]\d|2[0-3]):[0-5]\d) ч\.$/u);
    if (!parts || !validCalendarDate(parts[3]!, parts[2]!, parts[1]!) || !title) throw new Error("plovdiv-theatre: incomplete programme row");
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
    const sourceUrl = absolute(link.attribs.href, "https://www.clubcode.bg/");
    const target = new URL(sourceUrl);
    if (target.protocol !== "https:" || target.hostname !== "www.clubcode.bg") throw new Error("club-code-upcoming: event link left the source host");
    items.push(item(eventId, sourceUrl, { title, dateText }));
  }
  return unique("club-code-upcoming", items, ["List date omits the year; each event detail must be checked before display.", "Ticket availability is not part of this pilot."], "uncertain");
}

function parseEpayGoListing(dom: Root): PilotSnapshot {
  const cards = allByClass(dom, "event_content_box");
  if (cards.length === 0) throw new Error("epaygo-plovdiv-explicit: event cards missing");
  const items: PilotItem[] = [];
  for (const card of cards) {
    const title = text(firstByClass(card, "headline_text_t_all"));
    if (!/(?:Пловдив|Plovdiv)/iu.test(title)) continue;
    const dateNode = firstByClass(card, "headline_date_t_all");
    const dateText = dateNode ? DomUtils.getElementsByTagName("span", dateNode).map(text).filter((part) => part !== "от" && part !== "до").join(" ") : "";
    const id = card.attribs.id;
    const sourceUrl = `https://epaygo.bg/${id}`;
    const link = DomUtils.findOne((node) => node.attribs.href === sourceUrl, card);
    if (!/^\d{8,12}$/u.test(id ?? "") || !link || !dateText) throw new Error("epaygo-plovdiv-explicit: event identity or listing date changed");
    items.push(item(id!, sourceUrl, { title, dateText }));
  }
  if (items.length > 20) throw new Error("epaygo-plovdiv-explicit: detail request budget exceeded");
  return unique("epaygo-plovdiv-explicit", items, ["Only titles explicitly naming Plovdiv are considered; the national listing has no verified city filter.", "Each candidate must pass a separate dated detail and Plovdiv address check."]);
}

/** Null means the candidate lacks structured detail or its actual address is outside Plovdiv. */
export function parseEpayGoEventDetail(html: string, listingItem: PilotItem): PilotItem | null {
  const dom = parseDocument(html);
  const scripts = DomUtils.getElementsByTagName("script", dom).filter((script) => script.attribs.type === "application/ld+json");
  const event = scripts.map((script) => {
    try { return JSON.parse(DomUtils.textContent(script)) as Record<string, unknown>; }
    catch { return null; }
  }).find((value) => value?.["@type"] === "Event");
  if (!event) return null;
  if (event.name !== listingItem.fields.title) throw new Error("epaygo-plovdiv-explicit: listing and detail titles disagree");
  const location = event.location;
  const place = location && typeof location === "object" && "name" in location ? location.name : undefined;
  const addressObject = location && typeof location === "object" && "address" in location ? location.address : undefined;
  const address = addressObject && typeof addressObject === "object" && "streetAddress" in addressObject ? addressObject.streetAddress : undefined;
  const start = event.startDate;
  if (typeof address !== "string" || !/(?:Пловдив|Plovdiv)/iu.test(address)) return null;
  const parts = typeof start === "string" ? start.match(/^(\d{4})-(\d{2})-(\d{2})T((?:[01]\d|2[0-3]):[0-5]\d)$/u) : null;
  if (!parts || !validCalendarDate(parts[1]!, parts[2]!, parts[3]!) || typeof place !== "string" || !place) {
    throw new Error("epaygo-plovdiv-explicit: incomplete dated event detail");
  }
  const detailDate = new Date(`${parts[1]}-${parts[2]}-${parts[3]}T12:00:00Z`);
  const listingDate = String(listingItem.fields.dateText).match(/^(\d{1,2})\s+(\p{L}+)$/u);
  const detailMonth = new Intl.DateTimeFormat("bg-BG", { month: "long", timeZone: "UTC" }).format(detailDate);
  if (!listingDate || Number(listingDate[1]) !== Number(parts[3]) || listingDate[2] !== detailMonth) throw new Error("epaygo-plovdiv-explicit: listing and detail dates disagree");
  return item(listingItem.key, listingItem.sourceUrl, { title: String(event.name), date: `${parts[1]}-${parts[2]}-${parts[3]}`, time: parts[4]!, place, address, ...(eventImageUrl(event.image, listingItem.sourceUrl) ? { imageUrl: eventImageUrl(event.image, listingItem.sourceUrl)! } : {}) });
}

function parseAdoptionGuide(dom: Root): PilotSnapshot {
  const sourceId = "plovdiv-adoption-guide";
  const section = allByClass(dom, "contentContainer").find(container =>
    DomUtils.getElementsByTagName("h3", container).some(heading => text(heading) === "Как да осиновим куче?"));
  const paragraphs = section ? DomUtils.getElementsByTagName("p", section).map(paragraph => text(paragraph)) : [];
  if (paragraphs.length !== 2) throw new Error(`${sourceId}: adoption instructions changed`);
  const [visit, care] = paragraphs;
  if (!visit || !care || !/дойде в Приюта/u.test(visit) || !/разглеждането на нашите питомци/u.test(visit)
    || !/лична карта/u.test(visit) || !/нашийник и повод/u.test(visit)
    || !/обезпаразитени/u.test(care) || !/кастрирани/u.test(care) || !/ваксинирани против бяс/u.test(care)
    || !/електронен чип/u.test(care) || !/ветеринарен паспорт/u.test(care)) {
    throw new Error(`${sourceId}: required adoption details missing`);
  }
  const sourceUrl = "https://dogshelter.plovdiv.bg/";
  return unique(sourceId, [
    item("visit", sourceUrl, { label: "Посещение", detail: "Посетете приюта и изберете куче на място." }, visit),
    item("bring", sourceUrl, { label: "Необходими вещи", detail: "Носете лична карта, нашийник и повод за избраното куче." }, visit),
    item("care", sourceUrl, { label: "При осиновяване", detail: "Кучето се предава обезпаразитено, кастрирано, ваксинирано против бяс и чипирано, с ветеринарен паспорт. За малките кучета има отделна препоръка за кастрация при подходяща възраст." }, care),
  ], ["Published guidance has no update date; repeated checks confirm publication, not staff availability or individual eligibility."], "uncertain");
}

function parseGalleryExhibitions(dom: Root): PilotSnapshot {
  const sourceId = "plovdiv-gallery-current";
  const listingUrl = "https://galleryplovdiv.com/bg/vremenni-ekspozitsii/tekushti-izlojbi";
  const cards = allByClass(dom, "card").filter(card => firstByClass(card, "card__title"));
  if (cards.length < 1 || cards.length > 40) throw new Error(`${sourceId}: exhibition listing missing or changed`);
  const entries = cards.map(card => {
    const link = firstByClass(card, "card__link");
    const href = link?.attribs.href ?? "";
    const key = href.match(/^https:\/\/galleryplovdiv\.com\/bg\/izlojbi\/([a-z0-9-]+)$/u)?.[1];
    const title = text(firstByClass(card, "card__title"));
    const dates = DomUtils.getElementsByTagName("time", card).map(time => time.attribs.datetime?.match(/^(\d{4})-(\d{2})-(\d{2}) 00:00:00$/u));
    const [start, end] = dates;
    const helpers = allByClass(card, "card__helper-text");
    const venue = helpers[1] ? text(helpers[1]) : "";
    if (!key || !title || title.length > 180 || dates.length !== 2 || !start || !end
      || !validCalendarDate(start[1]!, start[2]!, start[3]!) || !validCalendarDate(end[1]!, end[2]!, end[3]!)
      || `${end[1]}-${end[2]}-${end[3]}` < `${start[1]}-${start[2]}-${start[3]}` || !venue) {
      throw new Error(`${sourceId}: incomplete exhibition card`);
    }
    return item(key, listingUrl, { title, startDate: `${start[1]}-${start[2]}-${start[3]}`, endDate: `${end[1]}-${end[2]}-${end[3]}`, venue, ...(eventImageUrl(firstTag(card, "img")?.attribs.src, listingUrl) ? { imageUrl: eventImageUrl(firstTag(card, "img")?.attribs.src, listingUrl)! } : {}) });
  });
  return unique(sourceId, entries, ["The current listing can contain ended exhibitions; reader view filters by end date.", "No explicit cancellation state or verified opening hours are provided."], "uncertain");
}

function parseMunicipalContacts(dom: Root): PilotSnapshot {
  const sourceId = "plovdiv-contacts";
  const sourceUrl = "https://www.plovdiv.bg/fmenu/contacts/";
  const paragraphs = DomUtils.getElementsByTagName("p", dom);
  const addressText = paragraphs.map(paragraph => text(paragraph)).find(value => value.includes("седалище и адрес на управление:") && value.includes("Стамболов"));
  const phoneText = paragraphs.map(paragraph => text(paragraph)).find(value => value.includes("080011232") && value.includes("+35932656700"));
  const districts = paragraphs.find(paragraph => text(paragraph).includes("6 административни района:"));
  if (!addressText || !phoneText || !districts) throw new Error(`${sourceId}: core contacts missing`);
  const address = addressText.match(/седалище и адрес на управление:\s*(гр\. Пловдив,\s*пл\. „Ст\. Стамболов“ №1)/u)?.[1];
  const phones = phoneText.match(/телефон:\s*(0800\s?112\s?32|080011232)\s+и\s+(\+35932656700)/u);
  if (!address || !phones) throw new Error(`${sourceId}: address or phone format changed`);
  const entries = [item("main", sourceUrl, { label: "Община Пловдив", address, phone: phones[1]!, secondPhone: phones[2]! })];
  const lines = DomUtils.getInnerHTML(districts).split(/<br\s*\/?\s*>/iu).map(line => text(parseDocument(line)));
  const expected = ["Централен", "Източен", "Западен", "Северен", "Южен", "Тракия"];
  for (const name of expected) {
    const matches = lines.filter(line => line.startsWith(`Район „${name}“`));
    const districtAddress = matches[0]?.match(/адрес на управление\s*(гр\. Пловдив,\s*.+)$/u)?.[1]?.replace(/[,]$/u, "");
    if (matches.length !== 1 || !districtAddress || districtAddress.length > 160) throw new Error(`${sourceId}: district contact missing or duplicated: ${name}`);
    entries.push(item(name, sourceUrl, { label: `Район „${name}“`, address: districtAddress }));
  }
  return unique(sourceId, entries, ["The page gives no reception hours or district phone numbers; these are addresses, not a complete service directory.", "Public web form uses CAPTCHA and is not submitted by the pilot."], "uncertain");
}

function parseMunicipalTaxes2026(dom: Root): PilotSnapshot {
  const sourceId = "plovdiv-taxes-2026";
  const sourceUrl = "https://www.plovdiv.bg/plashtame-s-5-otstapka-danak-imoti-i-tbo-ako-vnesem-tsyalata-suma-do-kraya-na-april/";
  const article = firstByClass(dom, "post-content");
  const headings = DomUtils.getElementsByTagName("h1", dom).map(node => text(node));
  if (!article || !headings.some(heading => heading.includes("данък имоти и ТБО"))) throw new Error(`${sourceId}: municipal notice missing`);
  const paragraphs = DomUtils.getElementsByTagName("p", article).map(paragraph => text(paragraph));
  const annual = paragraphs.find(line => line.includes("ДАНЪК ВЪРХУ НЕДВИЖИМИТЕ ИМОТИ") && line.includes("2026"));
  const annualDates = paragraphs.find(line => line.includes("Първа вноска") && line.includes("Втора вноска"));
  const patent = paragraphs.find(line => line.includes("ЗА ПАТЕНТЕН ДАНЪК ЗА 2026"));
  const patentDates = paragraphs.find(line => line.includes("За първото тримесечие") && line.includes("За четвъртото тримесечие"));
  if (!annual || !annualDates || !patent || !patentDates) throw new Error(`${sourceId}: annual tax sections changed`);
  const annualFirst = annualDates.match(/Първа вноска\s*[–-]\s*до (\d{2})\.(\d{2})\.(2026)/u);
  const annualSecond = annualDates.match(/Втора вноска\s*[–-]\s*до (\d{2})\.(\d{2})\.(2026)/u);
  const patentFourth = patentDates.match(/За четвъртото тримесечие\s*[–-]\s*до (\d{2})\.(\d{2})\.(2026)/u);
  if (!annualFirst || !annualSecond || !patentFourth || !validCalendarDate(annualFirst[3]!, annualFirst[2]!, annualFirst[1]!)
    || !validCalendarDate(annualSecond[3]!, annualSecond[2]!, annualSecond[1]!)
    || !validCalendarDate(patentFourth[3]!, patentFourth[2]!, patentFourth[1]!)) throw new Error(`${sourceId}: payment dates missing or invalid`);
  const date = (match: RegExpMatchArray) => `${match[3]}-${match[2]}-${match[1]}`;
  const entries = [
    item("annual-second", sourceUrl, { kind: "deadline", label: "Данък имоти, такса битови отпадъци и данък МПС · втора вноска", dueDate: date(annualSecond) }),
    item("patent-fourth", sourceUrl, { kind: "deadline", label: "Патентен данък · четвърта вноска", dueDate: date(patentFourth) }),
  ];
  return unique(sourceId, entries, [
    "Only the quoted 2026 municipal notice is covered. It is not an automatic discovery mechanism for 2027 deadlines or changed legal rules.",
    "Previous installments and the early-payment discount are not shown as current advice after their deadlines.",
  ], "uncertain");
}

function parseMunicipalTaxNotices(dom: Root): PilotSnapshot {
  const sourceId = "plovdiv-tax-notices";
  const sourceUrl = "https://www.plovdiv.bg/item/taxes/mdt-messages/";
  const content = DomUtils.getElementById("content", dom);
  if (!content || text(firstTag(content, "h1")) !== "Съобщения и обяви") throw new Error(`${sourceId}: municipal notices page missing`);
  const entries: PilotItem[] = [];
  const years = new Set<string>();
  for (const block of allByClass(content, "anons")) {
    const paragraphs = DomUtils.getElementsByTagName("p", block).map(node => text(node));
    const annualIndex = paragraphs.findIndex(line => /^ДАНЪК ВЪРХУ НЕДВИЖИМИТЕ ИМОТИ, ТАКСА ЗА БИТОВИ ОТПАДЪЦИ И ДАНЪК ВЪРХУ ПРЕВОЗНИТЕ СРЕДСТВА ЗА 20\d{2} Г\.$/u.test(line));
    if (annualIndex < 0) continue;
    const year = paragraphs[annualIndex]!.match(/ЗА (20\d{2}) Г\.$/u)?.[1];
    const patentIndex = paragraphs.findIndex(line => line === `ЗА ПАТЕНТЕН ДАНЪК ЗА ${year} Г.`);
    const intro = paragraphs.find(line => line.includes("сроковете за заплащане") && line.includes(`за ${year} г.`));
    if (!year || years.has(year) || !intro || patentIndex <= annualIndex || patentIndex !== annualIndex + 2 || annualIndex + 1 >= paragraphs.length || patentIndex + 1 >= paragraphs.length) {
      throw new Error(`${sourceId}: conflicting or incomplete annual notice`);
    }
    years.add(year);
    const dateFrom = (line: string, label: string): string => {
      const match = line.match(new RegExp(`${label}\\s*[–-]\\s*до (\\d{2})\\.(\\d{2})\\.(${year})`, "u"));
      if (!match || !validCalendarDate(match[3]!, match[2]!, match[1]!)) throw new Error(`${sourceId}: invalid ${label} date for ${year}`);
      return `${match[3]}-${match[2]}-${match[1]}`;
    };
    const annualText = paragraphs[annualIndex + 1]!;
    const patentText = paragraphs[patentIndex + 1]!;
    const deadlines = [
      { key: "annual-first", marker: "Първа вноска", label: "Данък имоти, такса битови отпадъци и данък МПС · първа вноска", text: annualText },
      { key: "annual-second", marker: "Втора вноска", label: "Данък имоти, такса битови отпадъци и данък МПС · втора вноска", text: annualText },
      { key: "patent-first", marker: "За първото тримесечие", label: "Патентен данък · първа вноска", text: patentText },
      { key: "patent-second", marker: "За второто тримесечие", label: "Патентен данък · втора вноска", text: patentText },
      { key: "patent-third", marker: "За третото тримесечие", label: "Патентен данък · трета вноска", text: patentText },
      { key: "patent-fourth", marker: "За четвъртото тримесечие", label: "Патентен данък · четвърта вноска", text: patentText },
    ];
    const dates = deadlines.map(deadline => dateFrom(deadline.text, deadline.marker));
    if (dates[0]! > dates[1]! || dates[2]! > dates[3]! || dates[3]! > dates[4]! || dates[4]! > dates[5]!) throw new Error(`${sourceId}: installment order changed`);
    entries.push(...deadlines.map((deadline, index) => item(`${year}:${deadline.key}`, sourceUrl, { year, label: deadline.label, dueDate: dates[index]! })));
  }
  if (years.size > 3) throw new Error(`${sourceId}: unexpected number of annual notices`);
  return unique(sourceId, entries, [
    "The maintained municipal notice page can publish deadlines for several years and unrelated declarations; only the six validated installments in each annual tax block are extracted.",
    "Expired installments are filtered in the reader. A current-year notice not yet published is not inferred from a previous year.",
    "Individual tax balances, payment instructions and legal changes outside this page are not covered.",
  ], "uncertain");
}

function parseMunicipalTaxOffices(dom: Root): PilotSnapshot {
  const sourceId = "plovdiv-taxes";
  const sourceUrl = "https://www.plovdiv.bg/item/taxes/";
  const content = DomUtils.getElementById("content", dom);
  if (!content || text(firstTag(content, "h1")) !== "Данъци и такси"
    || !DomUtils.getElementsByTagName("p", content).some(line => text(line).includes("Каси на дирекция „Местни данъци и такси"))) throw new Error(`${sourceId}: tax office directory missing`);
  const table = DomUtils.getElementsByTagName("table", content)[0];
  const rows = table ? DomUtils.getElementsByTagName("tr", table) : [];
  const headers = rows[0] ? DomUtils.getElementsByTagName("td", rows[0]).map(cell => text(cell)) : [];
  if (rows.length !== 7 || headers.join("|") !== "РАЙОН|АДРЕС|РАБОТНО ВРЕМЕ") throw new Error(`${sourceId}: cash desk table changed`);
  const entries: PilotItem[] = [];
  const expectedDistricts = ["ЦЕНТРАЛЕН", "ЮЖЕН", "СЕВЕРЕН", "ЗАПАДЕН", "ИЗТОЧЕН", "ТРАКИЯ"];
  for (const [index, row] of rows.slice(1).entries()) {
    const cells = DomUtils.getElementsByTagName("td", row).map(cell => text(cell));
    const district = cells[0]?.replace(/[„“”]/gu, "").trim();
    const address = cells[1];
    const hours = cells[2];
    if (cells.length !== 3 || district !== expectedDistricts[index] || !address || address.length > 120
      || !hours || !/^\d{2}\.\d{2} ч\.\s*[–-]\s*\d{2}\.\d{2} ч\.$/u.test(hours)) throw new Error(`${sourceId}: incomplete district desk`);
    entries.push(item(`desk:${district}`, sourceUrl, { label: `Каса „${district}“`, address, hours }));
  }
  return unique(sourceId, entries, [
    "The municipality publishes these desk hours without a visible last-review date; a successful recheck is not proof that a desk is open on a holiday.",
    "This directory gives no individual tax balance or appointment availability.",
  ], "uncertain");
}

function parseDogShelter(dom: Root): PilotSnapshot {
  const gallery = DomUtils.getElementById("adoption-gallery", dom);
  if (!gallery) throw new Error("plovdiv-dog-shelter: adoption gallery missing");
  const cards = allByClass(gallery, "dog-post-container");
  const items: PilotItem[] = [];
  for (const card of cards) {
    const image = firstByClass(card, "dog-image");
    const link = image && firstTag(image, "a");
    const sourceImage = link?.attribs.href ?? "";
    const dogId = sourceImage.match(/^https:\/\/register-dogs\.com\/shelter\/uploads\/plovdivd_shelter\/(\d+)\//u)?.[1];
    const info = firstByClass(card, "dog-information");
    const values = new Map<string, string>();
    for (const field of info ? DomUtils.getElementsByTagName("dl", info) : []) {
      const label = text(firstTag(field, "dt")).replace(/:$/u, "");
      values.set(label, text(firstTag(field, "dd")));
    }
    const description = text(info && firstByClass(info, "dog-description"));
    const breed = values.get("Порода");
    const sex = values.get("Пол");
    const size = values.get("Размер");
    const color = values.get("Цвят");
    if (!dogId || !breed || !sex || !size || !color || !description) throw new Error("plovdiv-dog-shelter: incomplete dog profile");
    const candidatePhoto = eventImageUrl(sourceImage, "https://dogshelter.plovdiv.bg/");
    const photo = candidatePhoto && new URL(candidatePhoto).pathname.startsWith(`/shelter/uploads/plovdivd_shelter/${dogId}/`) ? candidatePhoto : null;
    items.push(item(dogId, "https://dogshelter.plovdiv.bg/dogs-for-adoption", { dogId, breed, sex, size, color, description, ...(photo ? { imageUrl: photo } : {}) }));
  }
  return unique("plovdiv-dog-shelter", items, [
    "Profile ID is derived from the image directory; there are no individual profile URLs on this listing.",
    "Disappearance from the listing does not prove adoption; publication lag and status changes require repeated observation.",
    "Adoption availability is not confirmed by presence in this listing.",
  ], "uncertain");
}

export function parseClubEventDetail(html: string, listingItem: PilotItem): PilotItem {
  const dom = parseDocument(html);
  let event: Record<string, unknown> | undefined;
  for (const script of DomUtils.getElementsByTagName("script", dom)) {
    if (script.attribs.type !== "application/ld+json") continue;
    try {
      const parsed: unknown = JSON.parse(DomUtils.textContent(script));
      if (parsed && typeof parsed === "object" && "@type" in parsed && parsed["@type"] === "Event") {
        event = parsed as Record<string, unknown>;
        break;
      }
    } catch { /* Other JSON-LD blocks are not event data. */ }
  }
  const location = event?.location;
  const place = location && typeof location === "object" && "name" in location ? location.name : undefined;
  const addressObject = location && typeof location === "object" && "address" in location ? location.address : undefined;
  const address = addressObject && typeof addressObject === "object" && "streetAddress" in addressObject ? addressObject.streetAddress : undefined;
  const start = event?.startDate;
  const end = event?.endDate;
  const status = event?.eventStatus;
  const validDate = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:Z|[+-]\d{2}:\d{2})$/u.test(value) && Number.isFinite(Date.parse(value));
  const allowedStatuses = new Set(["EventScheduled", "EventCancelled", "EventPostponed", "EventRescheduled"]);
  const statusName = typeof status === "string" ? status.replace("https://schema.org/", "") : "";
  if (!event || event.name !== listingItem.fields.title || !validDate(start) || !validDate(end) || Date.parse(end) <= Date.parse(start) || typeof place !== "string" || !place || !allowedStatuses.has(statusName) || typeof event.url !== "string" || new URL(event.url).searchParams.get("eventid") !== listingItem.key) {
    throw new Error("club-code-upcoming: event detail missing or inconsistent");
  }
  const parts = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Europe/Sofia" }).formatToParts(new Date(start));
  const part = (type: string) => parts.find(entry => entry.type === type)?.value ?? "";
  const listingDate = `${part("day")} ${part("month")}, ${part("hour")}:${part("minute")}`;
  if (!String(listingItem.fields.dateText).includes(listingDate)) throw new Error("club-code-upcoming: listing and detail dates disagree");
  const offer = event.offers;
  const price = offer && typeof offer === "object" && "price" in offer ? offer.price : undefined;
  const currency = offer && typeof offer === "object" && "priceCurrency" in offer ? offer.priceCurrency : undefined;
  const fields: Record<string, string | number> = { title: String(event.name), startDate: start, endDate: end, place, status: statusName };
  const image = eventImageUrl(event.image, listingItem.sourceUrl);
  if (image) fields.imageUrl = image;
  if (typeof address === "string" && address) fields.address = address;
  if ((typeof price === "string" || typeof price === "number") && /^\d+(?:\.\d{1,2})?$/u.test(String(price)) && Number(price) > 0 && currency === "EUR") {
    fields.price = Number(price);
    fields.currency = currency;
  }
  return item(listingItem.key, listingItem.sourceUrl, fields);
}

export function parsePilotPage(sourceId: string, html: string): PilotSnapshot {
  const dom = parseDocument(html);
  switch (sourceId) {
    case "vik-outages": return parseVik(dom);
    case "evn-heating-outages": return parseEvnHeatingOutages(dom);
    case "plovdiv-parking-rules": return parseParkingRules(dom);
    case "plovdiv-parking-operator": return parseParkingOperator(dom);
    case "plovdiv-municipal-schools": return parseMunicipalSchools(dom);
    case "plovdiv-transit": return parseTransitFares(dom);
    case "plovdiv-low-emission": return parseLowEmissionZone(dom);
    case "plovdiv-social-services": return parseSocialServices(dom);
    case "plovdiv-housing": return parseMunicipalHousing(dom);
    case "plovdiv-airport-flights": return parseAirportFlights(dom);
    case "plovdiv-eco-signals": return parseEcoSignals(dom);
    case "plovdiv-transport-signals": return parseTransportSignals(dom);
    case "chistota-bulky-waste": return parseBulkyWaste(dom);
    case "dz-vacancies": return parseDz(dom);
    case "dz-institutions": return parseDzInstitutions(dom);
    case "plovdiv-council": return parseCouncil(dom);
    case "plovdiv-opera": return parseOpera(dom);
    case "plovdiv-theatre": return parseTheatre(dom);
    case "club-code-upcoming": return parseClubCode(dom);
    case "epaygo-plovdiv-explicit": return parseEpayGoListing(dom);
    case "plovdiv-dog-shelter": return parseDogShelter(dom);
    case "plovdiv-adoption-guide": return parseAdoptionGuide(dom);
    case "plovdiv-gallery-current": return parseGalleryExhibitions(dom);
    case "plovdiv-contacts": return parseMunicipalContacts(dom);
    case "plovdiv-taxes-2026": return parseMunicipalTaxes2026(dom);
    case "plovdiv-tax-notices": return parseMunicipalTaxNotices(dom);
    case "plovdiv-taxes": return parseMunicipalTaxOffices(dom);
    default: throw new Error(`unsupported pilot source: ${sourceId}`);
  }
}
