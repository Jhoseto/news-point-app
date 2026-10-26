import { describe, expect, it } from "vitest";
import { parsePilotPage } from "./parse";

function notice(second = "02.11.2026") {
  return `<h1>Плащаме с 5% отстъпка данък имоти и ТБО</h1><div class="post-content">
    <p>ДАНЪК ВЪРХУ НЕДВИЖИМИТЕ ИМОТИ, ТАКСА ЗА БИТОВИ ОТПАДЪЦИ И ДАНЪК ВЪРХУ ПРЕВОЗНИТЕ СРЕДСТВА ЗА 2026 Г.</p>
    <p>Първа вноска – до 30.06.2026 г.<br>Втора вноска – до ${second} г.</p>
    <p>ЗА ПАТЕНТЕН ДАНЪК ЗА 2026 Г.</p>
    <p>За първото тримесечие – до 02.02.2026 г.<br>За четвъртото тримесечие – до 02.11.2026 г.</p></div>`;
}

function offices(omitDistrict = "") {
  const districts = ["ЦЕНТРАЛЕН", "ЮЖЕН", "СЕВЕРЕН", "ЗАПАДЕН", "ИЗТОЧЕН", "ТРАКИЯ"];
  return `<div id="content"><h1>Данъци и такси</h1><p>Каси на дирекция „Местни данъци и такси” в гр.Пловдив:</p>
    <table><tr><td>РАЙОН</td><td>АДРЕС</td><td>РАБОТНО ВРЕМЕ</td></tr>
    ${districts.filter(name => name !== omitDistrict).map(name => `<tr><td>„${name}”</td><td>ул. „Тест“ №1</td><td>08.30 ч. – 16.45 ч.</td></tr>`).join("")}</table></div>`;
}

describe("2026 municipal tax notice", () => {
  it("keeps the dated deadlines separate from office contacts", () => {
    const parsed = parsePilotPage("plovdiv-taxes-2026", notice());
    expect(parsed.items).toHaveLength(2);
    expect(parsed.items[0]).toMatchObject({ key: "annual-second", fields: { dueDate: "2026-11-02" } });
    expect(parsed.completeness).toBe("uncertain");
  });

  it("detects an edited deadline and rejects invalid dates", () => {
    const changed = parsePilotPage("plovdiv-taxes-2026", notice("03.11.2026"));
    expect(changed.items[0]?.fingerprint).not.toBe(parsePilotPage("plovdiv-taxes-2026", notice()).items[0]?.fingerprint);
    expect(() => parsePilotPage("plovdiv-taxes-2026", notice("31.11.2026"))).toThrow("payment dates");
  });

  it("requires all six offices and detects an address edit", () => {
    const parsed = parsePilotPage("plovdiv-taxes", offices());
    expect(parsed.items).toHaveLength(6);
    expect(parsed.items[5]).toMatchObject({ key: "desk:ТРАКИЯ", fields: { address: "ул. „Тест“ №1" } });
    expect(parsePilotPage("plovdiv-taxes", offices().replace("ул. „Тест“ №1", "ул. „Тест“ №2")).items[0]?.fingerprint).not.toBe(parsed.items[0]?.fingerprint);
    expect(() => parsePilotPage("plovdiv-taxes", offices("ТРАКИЯ"))).toThrow("cash desk table changed");
  });
});
