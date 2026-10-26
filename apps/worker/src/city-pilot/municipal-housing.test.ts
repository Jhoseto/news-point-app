import { describe, expect, it } from "vitest";
import { parsePilotPage } from "./parse";

function housingPage(reserveText = "лица в жилищна нужда") {
  const rental = Array.from({ length: 9 }, (_, index) => `<p>${index + 1}. Условие за жилищна нужда и проверка на документите по реда на наредбата.</p>`).join("");
  const reserve = Array.from({ length: 3 }, (_, index) => `<p>${index + 1}. ${reserveText} след проверка от компетентната районна администрация.</p>`).join("");
  const staff = Array.from({ length: 2 }, (_, index) => `<p>${index + 1}. Условие за служителите и техните семейства при подаване на молба.</p>`).join("");
  return `<div id="content"><h1>ЖИЛИЩНО НАСТАНЯВАНЕ</h1>
    <p>I. Съгласно чл. 7 фонд “Настаняване под наем“ приема кандидати при посочените условия.</p>${rental}
    <p>Обстоятелствата се установяват със саморъчно подписана декларация и документи.</p>
    <p>Подреждането се прави от комисия по чл. 12 в съответния район.</p>
    <p>II. Чл. 45 урежда фонд “Резервен” при адресна регистрация от 5 /пет/ години.</p>${reserve}
    <p>Желаещите се обръщат към съответния район по адресна регистрация.</p>
    <p>III. Съгласно чл. 34 фонд „Ведомствен“ е за служители.</p>${staff}
    <p>Молбата и декларацията по чл. 35 се подават до кмета на съответния район.</p>
    <p class="pvc_stats">123 total views</p></div>`;
}

describe("municipal housing pilot", () => {
  it("keeps all three published sections with stable keys and detects a changed condition", () => {
    const original = parsePilotPage("plovdiv-housing", housingPage());
    const edited = parsePilotPage("plovdiv-housing", housingPage("лица в спешна жилищна нужда"));
    expect(original.items.map(item => item.key)).toEqual(["rental", "reserve", "staff"]);
    expect(original.items[1]?.fields.body).toContain("5 /пет/ години");
    expect(original.items[1]?.fingerprint).not.toBe(edited.items[1]?.fingerprint);
    expect(original.items[0]?.fingerprint).toBe(edited.items[0]?.fingerprint);
    expect(original.items[2]?.fields.body).not.toContain("total views");
  });

  it("rejects an omitted condition or section instead of retaining a partial guide", () => {
    expect(() => parsePilotPage("plovdiv-housing", housingPage().replace("9. Условие", "Условие"))).toThrow(/incomplete rental/u);
    expect(() => parsePilotPage("plovdiv-housing", housingPage().replace("III. Съгласно", "Съгласно"))).toThrow(/three housing fund sections/u);
  });
});
