import { describe, expect, it } from "vitest";
import { parsePilotPage } from "./parse";

const page = (first = "Всеки може да дойде в Приюта и започваме с разглеждането на нашите питомци. Носете лична карта, нашийник и повод.", second = "Кучетата са обезпаразитени, кастрирани, ваксинирани против бяс и маркирани с електронен чип. Получавате ветеринарен паспорт.") =>
  `<div class="contentContainer"><h3>Как да осиновим куче?</h3><p>${first}</p><p>${second}</p></div>`;

describe("adoption guidance", () => {
  it("extracts three stable guidance items and detects a changed instruction", () => {
    const before = parsePilotPage("plovdiv-adoption-guide", page());
    const after = parsePilotPage("plovdiv-adoption-guide", page().replace("Носете лична карта", "Моля, носете лична карта"));
    expect(before.items.map(entry => entry.key)).toEqual(["visit", "bring", "care"]);
    expect(before.items[1]?.fingerprint).not.toBe(after.items[1]?.fingerprint);
  });

  it("rejects missing requirements and changed structure", () => {
    expect(() => parsePilotPage("plovdiv-adoption-guide", page().replace("лична карта", "документ"))).toThrow("required adoption details missing");
    expect(() => parsePilotPage("plovdiv-adoption-guide", page().replace("Как да осиновим куче?", "Как става?"))).toThrow("adoption instructions changed");
  });
});
