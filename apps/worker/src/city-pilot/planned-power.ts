import { createHash } from "node:crypto";
import { DomUtils as D, parseDocument } from "htmlparser2";
import type { PilotSnapshot } from "./parse";
const sourceId = "elyug-planned-plovdiv-region";
const sourceUrl = "https://www.elyug.bg/oldservices/ec_ep/abschaltung_bg/abschaltung4.asp";
const labels = ["Област", "КЕЦ", "Адрес(и)", "Срок на изключването от / до", "Дата(и) на изключването"];
const clean = (value: string) => value.replace(/\s+/gu, " ").trim();
function day(raw: string): string {
  const match = raw.match(/^(\d{1,2})\.(\d{1,2})\.(20\d{2})$/u);
  if (!match) throw new Error("planned power: invalid date");
  const value = `${match[3]}-${match[2]!.padStart(2, "0")}-${match[1]!.padStart(2, "0")}`;
  if (new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) !== value) throw new Error("planned power: impossible date");
  return value;
}
export function parsePlannedPower(html: string, now = new Date()): PilotSnapshot {
  const rows = D.getElementsByTagName("tr", parseDocument(html)).map(row => D.getElementsByTagName("td", row).map(cell => clean(D.textContent(cell)))).filter(cells => cells.some(Boolean));
  if (!rows.length || rows.length % labels.length !== 0) throw new Error("planned power: incomplete regional table");
  const items: PilotSnapshot["items"] = [];
  const today = now.toLocaleDateString("sv-SE", { timeZone: "Europe/Sofia" });
  for (let index = 0; index < rows.length; index += labels.length) {
    const block = rows.slice(index, index + labels.length);
    if (block.some((cells, i) => cells.length !== 2 || cells[0] !== labels[i] || !cells[1]) || block[0]![1] !== "ПЛОВДИВ") throw new Error("planned power: regional structure changed");
    const address = block[2]![1]!;
    const dates = block[4]![1]!.match(/^(\d{1,2}\.\d{1,2}\.20\d{2}) до (\d{1,2}\.\d{1,2}\.20\d{2})$/u);
    const hours = block[3]![1]!.match(/^([0-2]\d:[0-5]\d) - ([0-2]\d:[0-5]\d)$/u);
    if (!dates || !hours || Number(hours[1]!.slice(0, 2)) > 23 || Number(hours[2]!.slice(0, 2)) > 23) throw new Error("planned power: dated window missing");
    const startDate = day(dates[1]!), endDate = day(dates[2]!);
    if (`${endDate}T${hours[2]}` <= `${startDate}T${hours[1]}`) throw new Error("planned power: inverted period");
    // A service centre named Plovdiv also serves other towns. Only the address establishes the city.
    if (!/(?:^|[^\p{L}])(?:гр\.?|град)\s*пловдив(?:[^\p{L}]|$)/iu.test(address) || endDate < today) continue;
    const key = createHash("sha256").update(`${address}|${startDate}`).digest("hex");
    if (items.some(item => item.key === key)) throw new Error("planned power: ambiguous duplicate address");
    const fields = { address, startDate, endDate, startTime: hours[1]!, endTime: hours[2]!, kind: "planned" };
    items.push({ key, fields, sourceUrl, fingerprint: createHash("sha256").update(JSON.stringify(fields)).digest("hex") });
  }
  return { sourceId, items, completeness: "uncertain", limitations: ["Only explicit city addresses from the published regional planned-shutdown table; not unplanned outages.", "No matching city row does not mean there are no electricity faults. Removal is not confirmation that power has been restored."] };
}
