import { describe, expect, it } from "vitest";
import { parsePilotPage } from "./parse";

const counts = [4, 21, 2, 18, 5, 2];
function directory(options: { omit?: number; brokenPhone?: number } = {}): string {
  let number = 0;
  const tables = counts.map((count, group) => {
    const rows = Array.from({ length: count }, () => {
      number++;
      if (number === options.omit) return "";
      const phone = number === options.brokenPhone ? "няма" : "635-311";
      return `<tr><td><h5><b>Училище ${number}<br><a href="https://school.example">school.example</a></b></h5></td><td>Централен</td><td>ул. „Правда“ № ${number}</td><td>${phone}</td></tr>`;
    }).join("");
    const header = group === 2 || group === 5 ? "" : "<tr><td>Наименование</td><td>Район</td><td>Адрес</td><td>Телефон</td></tr>";
    return `<table>${header}${rows}</table>`;
  }).join("");
  return `<div id="content"><h1>Общински училища</h1>${tables}</div>`;
}

describe("published municipal school directory", () => {
  it("keeps 52 distinct contacts and excludes school website links from names", () => {
    const snapshot = parsePilotPage("plovdiv-municipal-schools", directory());
    expect(snapshot.items).toHaveLength(52);
    expect(snapshot.items[0]?.fields.name).toBe("Училище 1");
    expect(snapshot.items[0]?.fields).toMatchObject({ district: "Централен", address: "ул. „Правда“ № 1", phone: "635-311" });
    expect(snapshot.completeness).toBe("uncertain");
  });

  it("hides the whole source after a missing school or invalid contact", () => {
    expect(() => parsePilotPage("plovdiv-municipal-schools", directory({ omit: 4 }))).toThrow("row count changed");
    expect(() => parsePilotPage("plovdiv-municipal-schools", directory({ brokenPhone: 4 }))).toThrow("incomplete school contact");
  });
});
