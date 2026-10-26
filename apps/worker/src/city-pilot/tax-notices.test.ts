import { describe, expect, it } from "vitest";
import { parsePilotPage } from "./parse";

function annualNotice(year: string, second = `02.11.${year}`) {
  return `<div class="anons"><p>Съгласно закона сроковете за заплащане на задълженията за ${year} г. са както следва:</p>
    <p>ДАНЪК ВЪРХУ НЕДВИЖИМИТЕ ИМОТИ, ТАКСА ЗА БИТОВИ ОТПАДЪЦИ И ДАНЪК ВЪРХУ ПРЕВОЗНИТЕ СРЕДСТВА ЗА ${year} Г.</p>
    <p>Първа вноска – до 30.06.${year} г.<br>Втора вноска – до ${second} г.</p>
    <p>ЗА ПАТЕНТЕН ДАНЪК ЗА ${year} Г.</p>
    <p>За първото тримесечие – до 02.02.${year} г.<br>За второто тримесечие – до 30.04.${year} г.<br>За третото тримесечие – до 31.07.${year} г.<br>За четвъртото тримесечие – до 02.11.${year} г.</p></div>`;
}

function page(...blocks: string[]) {
  return `<div id="content"><h1>Съобщения и обяви</h1>
    <div class="anons"><p>За календарната 2027 г. декларацията се подава до 31.10.2026 г.</p></div>
    ${blocks.join("")}</div>`;
}

describe("municipal annual tax notice discovery", () => {
  it("ignores the unrelated 2027 declaration and reads all six 2026 installments", () => {
    const result = parsePilotPage("plovdiv-tax-notices", page(annualNotice("2026")));
    expect(result.items).toHaveLength(6);
    expect(result.items[1]).toMatchObject({ key: "2026:annual-second", fields: { year: "2026", dueDate: "2026-11-02" } });
    expect(result.items[5]).toMatchObject({ key: "2026:patent-fourth", fields: { dueDate: "2026-11-02" } });
  });

  it("keeps successive years separate and fingerprints a corrected deadline", () => {
    const original = parsePilotPage("plovdiv-tax-notices", page(annualNotice("2026"), annualNotice("2027")));
    expect(original.items).toHaveLength(12);
    expect(original.items[7]?.key).toBe("2027:annual-second");
    const revised = parsePilotPage("plovdiv-tax-notices", page(annualNotice("2026", "03.11.2026")));
    expect(revised.items[1]?.fingerprint).not.toBe(original.items[1]?.fingerprint);
  });

  it("rejects missing, conflicting and malformed annual blocks", () => {
    expect(() => parsePilotPage("plovdiv-tax-notices", page())).toThrow("no extractable rows");
    expect(() => parsePilotPage("plovdiv-tax-notices", page(annualNotice("2026"), annualNotice("2026", "03.11.2026")))).toThrow("conflicting or incomplete");
    expect(() => parsePilotPage("plovdiv-tax-notices", page(annualNotice("2026", "31.11.2026")))).toThrow("invalid Втора вноска date");
    expect(() => parsePilotPage("plovdiv-tax-notices", page(annualNotice("2026").replace("ЗА ПАТЕНТЕН ДАНЪК", "ПАТЕНТЕН ДАНЪК")))).toThrow("conflicting or incomplete");
  });
});
