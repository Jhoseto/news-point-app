import { createHash } from "node:crypto";
import { parseDocument, DomUtils as D } from "htmlparser2";
import type { PilotSnapshot } from "./parse";

export const VIVACOM_PARKING_URL = "https://www.vivacom.bg/dopalnitelni-uslugi/zabavlenie/sms-parkirane";
const clean = (value: string) => value.replace(/\s+/gu, " ").trim();

/** The requesting SMS number and the operator's charging number are different. */
export function parseVivacomParking(html: string): PilotSnapshot {
  const root = parseDocument(html);
  for (const node of D.getElementsByTagName("script", root)) D.removeElement(node);
  const tables = D.getElementsByTagName("table", root).filter(table => /Цена в евро с ДДС/u.test(clean(D.textContent(table))));
  if (tables.length !== 1) throw new Error("Vivacom parking: euro tariff table missing or ambiguous");
  const rows = D.getElementsByTagName("tr", tables[0]!);
  const matches = rows.map((row, index) => ({ cells: D.getElementsByTagName("td", row), index }))
    .filter(({ cells }) => clean(D.textContent(cells[0] ?? root)) === "Пловдив");
  if (matches.length !== 1) throw new Error("Vivacom parking: Plovdiv row missing or ambiguous");
  const { cells, index } = matches[0]!;
  const charge = rows[index + 1] ? D.getElementsByTagName("td", rows[index + 1]!) : [];
  const requestNumber = clean(D.textContent(cells[1] ?? root));
  const chargeNumber = clean(D.textContent(charge[0] ?? root));
  const amount = clean(D.textContent(charge[3] ?? root)).match(/^(\d{1,2}[.,]\d{2})\s*€$/u);
  if (cells.length !== 5 || cells[0]!.attribs.rowspan !== "2" || charge.length !== 4
    || !/^\d{4,6}$/u.test(requestNumber) || !/^\d{4,6}$/u.test(chargeNumber) || requestNumber === chargeNumber
    || !/Номер за заявяване на паркиране/u.test(clean(D.textContent(cells[2]!)))
    || clean(D.textContent(cells[3]!)) !== "SMS" || !/Според тарифен план/u.test(clean(D.textContent(cells[4]!)))
    || clean(D.textContent(charge[1]!)) !== "Таксуващ номер" || clean(D.textContent(charge[2]!)) !== "SMS" || !amount
    || !/1 час престой/u.test(clean(D.textContent(root)))) throw new Error("Vivacom parking: request/charging rows changed");
  const price = Number(amount[1]!.replace(",", "."));
  if (!(price > 0 && price <= 20)) throw new Error("Vivacom parking: invalid hourly price");
  const entries: { key: string; fields: Record<string, string | number> }[] = [
    { key: "request-number", fields: { label: "SMS за паркиране", value: requestNumber, detail: "Изпрати регистрационния номер на автомобила точно както е изписан на табелата." } },
    { key: "hour-price", fields: { label: "Един час · Vivacom", value: `${price.toFixed(2).replace(".", ",")} € + SMS`, detail: "С ДДС. Цената на заявяващото съобщение е според тарифния ти план.", price, currency: "EUR", chargeNumber } },
    { key: "confirmation", fields: { label: "Потвърждение на плащането", value: "Изчакай отговора по SMS", detail: "Провери автомобила и крайния час в потвърждението. При липса на успешно потвърждение не приемай, че паркирането е платено." } },
  ];
  return { sourceId: "vivacom-plovdiv-parking", completeness: "uncertain", limitations: ["Vivacom SMS service only; no zone boundaries, opening hours, resident permits or availability. The charging number is not the user request number."],
    items: entries.map(({ key, fields }) => ({ key, fields, sourceUrl: VIVACOM_PARKING_URL, fingerprint: createHash("sha256").update(JSON.stringify(fields)).digest("hex") })) };
}
