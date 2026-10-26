import { describe, expect, it } from "vitest";
import { parsePilotPage } from "./parse";

const card = `<div class="faq-wrap">
  <div class="faq-row"><h3>Адрес</h3><p>БЛ.156 ВХ.Г</p></div>
  <div class="faq-row"><h4>Неизправност</h4><p>Авария на топлопровод</p></div>
  <div class="faq-row"><h4>Дата на изключване от:</h4><p>23.10.2026 12:00:00</p></div>
  <div class="faq-row"><h4>Дата на изключване до:</h4><p>26.10.2026 20:00:00</p></div>
  <div class="faq-row"><h4>Срок на изключването до:</h4><p>26.10.2026 20:00:00</p></div>
</div>`;

function page(fault = card, plan = "", outInfo = "В момента са известни следните неизправности и се работи по отстраняването им:") {
  return `<section id="planned-repairs"><h2>Планирани прекъсвания и аварии</h2>
    <span id="ctl00_cphHeader_cphBodyContent_HeatingPlaningOutage_lblOut">${outInfo}</span>
    <div id="ctl00_cphHeader_cphBodyContent_HeatingPlaningOutage_pnlOutagesYes">${fault}</div>
    <span id="ctl00_cphHeader_cphBodyContent_HeatingPlaningOutage_lblPlaningInfo">В момента няма планирани изключвания по мрежата на EVN.</span>
    <div id="ctl00_cphHeader_cphBodyContent_HeatingPlaningOutage_Panel1">${plan}</div>
  </section>`;
}

describe("EVN heating interruptions", () => {
  it("reads a dated fault and detects a changed published deadline", () => {
    const before = parsePilotPage("evn-heating-outages", page()).items[0]!;
    const after = parsePilotPage("evn-heating-outages", page(card.replaceAll("26.10.2026 20:00:00", "27.10.2026 20:00:00"))).items[0]!;
    expect(before.fields).toMatchObject({ kind: "fault", issue: "Авария на топлопровод", start: "23.10.2026 12:00:00" });
    expect(after.key).toBe(before.key);
    expect(after.fingerprint).not.toBe(before.fingerprint);
  });
  it("accepts an explicitly empty report without calling previous faults resolved", () => {
    const snapshot = parsePilotPage("evn-heating-outages", page("", "", "В момента няма известни неизправности."));
    expect(snapshot.items).toEqual([]);
    expect(snapshot.completeness).toBe("uncertain");
  });
  it("refuses an empty panel that still announces faults or a malformed date", () => {
    expect(() => parsePilotPage("evn-heating-outages", page(""))).toThrow("empty fault panel");
    expect(() => parsePilotPage("evn-heating-outages", page(card.replace("26.10.2026", "32.10.2026")))).toThrow("incomplete fault outage row");
  });
});
