import { describe, expect, it } from "vitest";
import { parsePilotPage } from "./parse";

const page = `<h1>ОП „Паркиране и репатриране“</h1>
<p>ОП „Паркиране и репатриране“ е с адрес – ул. „Хр. Г. Данов“ № 28.</p>
<p>Информация: 032/269-696<br>Кол Център Скоби – 0893 633 270</p>
<p>Наказателен паркинг диспечер- 0884554110</p>
<h3>Всеки последен работен ден от месеца касата работи до 12:00 ч.</h3>`;

describe("municipal parking operator contacts", () => {
  it("extracts only the published contacts and office note", () => {
    const snapshot = parsePilotPage("plovdiv-parking-operator", page);
    expect(snapshot.items.map(row => row.key)).toEqual(["information", "clamps", "towing", "office"]);
    expect(snapshot.items[2]?.fields.phone).toBe("0884554110");
    expect(snapshot.items[3]?.fields.note).toContain("последен работен ден");
    expect(snapshot.completeness).toBe("uncertain");
  });
  it("refuses a changed or missing dispatcher number", () => {
    expect(() => parsePilotPage("plovdiv-parking-operator", page.replace("0884554110", "няма номер"))).toThrow("contact or office detail missing");
  });
});
