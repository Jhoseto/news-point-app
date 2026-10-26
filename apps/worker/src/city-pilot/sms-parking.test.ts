import { afterEach, describe, expect, it, vi } from "vitest";
import { parseVivacomParking, VIVACOM_PARKING_URL } from "./sms-parking";
import { runPilotSource } from "./run";

// Explicit miniature fixture modelled on the inspected operator table, not live data.
const page = (price = "1.02", request = "1332") => `<p>SMS паркиране: 1 час престой</p><table><tr><th>Град</th><th>Номер</th><th>Описание</th><th>Вид</th><th>Цена в евро с ДДС</th></tr>
<tr><td rowspan="2">Пловдив</td><td>${request}</td><td>Номер за заявяване на паркиране<br>Номер за информация</td><td>SMS</td><td>Според тарифен план</td></tr>
<tr><td>13321</td><td>Таксуващ номер</td><td>SMS</td><td>${price} €</td></tr>
<tr><td>Поморие</td><td>135961</td><td>Таксуващ номер</td><td>SMS</td><td>0.61 €</td></tr></table>`;
afterEach(() => vi.unstubAllGlobals());
describe("Vivacom Plovdiv SMS parking", () => {
  it("separates the requesting number from the charging number and other cities", () => {
    const result = parseVivacomParking(page());
    expect(result.items[0]!.fields.value).toBe("1332");
    expect(result.items[1]!.fields).toMatchObject({ price: 1.02, currency: "EUR", chargeNumber: "13321" });
    expect(result.items.every(item => item.sourceUrl === VIVACOM_PARKING_URL)).toBe(true);
    expect(result.items).toHaveLength(3);
  });
  it("tracks a price change without changing the record identity", () => {
    const a = parseVivacomParking(page()).items[1]!, b = parseVivacomParking(page("1.50")).items[1]!;
    expect(a.key).toBe(b.key); expect(a.fingerprint).not.toBe(b.fingerprint); expect(b.fields.price).toBe(1.5);
  });
  it("fails closed on missing, duplicated or reassigned city/charging rows and currency", () => {
    for (const html of [page().replace("Пловдив", "Друг град"), page() + page(), page().replace('rowspan="2"', 'rowspan="3"'),
      page().replace("13321", "1332"), page().replace("Таксуващ номер", "Друга услуга"), page().replace("евро", "лева"), page("0.00")])
      expect(() => parseVivacomParking(html)).toThrow();
  });
  it("preserves prior evidence on an access challenge and records the reason/backoff", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("challenge", { status: 202, headers: { "x-amzn-waf-action": "challenge", "retry-after": "172800" } })));
    const prior = { failures: 0, items: { old: "hash" }, lastSuccessAt: "2026-10-25T10:00:00Z" };
    const result = await runPilotSource({ id: "vivacom-plovdiv-parking", category: "parking", format: "html", url: VIVACOM_PARKING_URL }, prior, Date.parse("2026-10-26T10:00:00Z"));
    expect(result.journal).toMatchObject({ outcome: "failed", failureReason: "access-challenge", httpStatus: 202 });
    expect(result.state.lastSuccessAt).toBe(prior.lastSuccessAt); expect(result.state.items).toEqual(prior.items);
    expect(result.state.nextDueAt).toBe("2026-10-28T10:00:00.000Z"); expect(result.snapshot).toBeUndefined();
  });
});
