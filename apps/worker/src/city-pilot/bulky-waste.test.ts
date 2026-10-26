import { describe, expect, it } from "vitest";
import { parsePilotPage } from "./parse";

const districts = ["Южен", "Северен", "Източен", "Централен", "Западен", "Тракия"];
function article(without?: string): string {
  const sites = districts.filter(district => district !== without).map(district => `<p><strong>Район ${district}</strong><br>общ. Пловдив, гр. Пловдив, ул. „Проба“ № 1<br>след предварително обаждане на тел. 032 675 817, от 08:00 до 16:00 часа<br>Отпадъци, които се събират на площадката:<br>Хартия, стъкло, едрогабаритни отпадъци</p>`);
  return `<h1>Пловдивчани изхвърлят едрогабаритни отпадъци само след едно телефонно обаждане</h1><time>2 октомври, 2025</time><div class="elementor-widget-theme-post-content"><p>Важно е да се знае, че строителни отпадъци не се извозват.</p><p>Желаещите могат да подадат заявка на телефон <a href="tel:032675817">032/675 817</a>.</p>${sites.join("")}</div>`;
}

describe("published bulky-waste service", () => {
  it("extracts six districts and one pickup instruction with the original publication date", () => {
    const snapshot = parsePilotPage("chistota-bulky-waste", article());
    expect(snapshot.items).toHaveLength(7);
    expect(snapshot.items[0]?.fields).toMatchObject({ kind: "pickup", phone: "032/675 817", published: "2 октомври, 2025" });
    expect(snapshot.items.find(item => item.key === "district:Западен")?.fields.address).toContain("гр. Пловдив");
    expect(snapshot.completeness).toBe("uncertain");
  });
  it("refuses an incomplete district set", () => {
    expect(() => parsePilotPage("chistota-bulky-waste", article("Северен"))).toThrow("district missing");
  });
});
