import { describe, expect, it } from "vitest";
import { parsePilotPage } from "./parse";

const headers = ["№", "Център за социални услуги", "Адрес", "Телефон", "Електронна поща", "Социални услуги", "Информация за услугата", "Капацитет"];
function catalog(brokenNumber?: number, brokenColumn?: number): string {
  const rows = Array.from({ length: 50 }, (_, index) => {
    const number = index + 1;
    const cells = [String(number === brokenNumber ? 99 : number), index < 2 ? "Еднаква услуга" : `Услуга ${number}`, `ул. ${number}`, "032 123 456", "[email protected]", "Консултиране", "Подкрепа на място", "20"];
    if (number === brokenColumn) cells.pop();
    return `<tr class="data-row">${cells.map(cell => `<td>${cell}</td>`).join("")}</tr>`;
  });
  return `<h1>Каталог на социалните услуги - Община Пловдив</h1><table id="servicesTable"><thead><tr>${headers.map(header => `<th>${header}</th>`).join("")}</tr></thead><tbody id="tableBody">${rows.join("")}</tbody></table>`;
}

describe("municipal social service catalog", () => {
  it("keeps distinct addresses for repeated names and avoids an availability claim", () => {
    const snapshot = parsePilotPage("plovdiv-social-services", catalog());
    expect(snapshot.items).toHaveLength(50);
    expect(snapshot.items[0]?.key).not.toBe(snapshot.items[1]?.key);
    expect(snapshot.completeness).toBe("uncertain");
    expect(snapshot.items[0]?.fields).not.toHaveProperty("availablePlaces");
  });
  it("rejects a gap or a changed set of columns", () => {
    expect(() => parsePilotPage("plovdiv-social-services", catalog(12))).toThrow("row numbering");
    expect(() => parsePilotPage("plovdiv-social-services", catalog(undefined, 12))).toThrow("row numbering or columns");
  });
});
