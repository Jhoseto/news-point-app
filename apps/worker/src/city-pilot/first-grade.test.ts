import { describe, expect, it } from "vitest";
import { collectFirstGradeVacancies, parseFirstGradePage } from "./first-grade";

type School = { id: string; name: string; district: string; type: string; places: number };
const schools: School[] = Array.from({ length: 7 }, (_, index) => ({
  id: String(index + 1), name: `Училище ${index + 1}`, district: "Централен",
  type: index < 4 ? "Основни училища" : "Средни училища", places: index + 1,
}));

function page(count: number, rows: School[], globalPlaces = 28): string {
  const options = schools.map(school => `<option value="${school.id}">${school.name}</option>`).join("");
  const cards = rows.map(school => `<div class="school-district-title1">${school.type} / ${school.district} / ${school.name}</div><div class="school-table-txt1"><strong>1</strong><strong>${school.places}</strong><strong>0</strong></div>`).join("");
  return `<div class="list-main-title">Свободни места след трето класиране</div>
    <select id="sSchoolYear"><option value="2026" selected="selected">2026/2027</option></select>
    <select id="sSchoolId">${options}</select>
    <div id="vacancies_result">${count ? `<div class="school-table-title0">Места след трето класиране за учебна година 2026/2027</div><div class="school-table-title1"><div class="vacancies-table-title-txt">7</div><div class="vacancies-table-title-txt">${globalPlaces}</div></div>` : ""}${cards}</div>
    <script>$("#pagination").pagination(${count}, { items_per_page: 6 });</script>`;
}

describe("first-grade public GET partitions", () => {
  it("reconciles a district with more than six schools through its school types", async () => {
    const requested: string[] = [];
    const result = await collectFirstGradeVacancies(page(7, schools.slice(0, 6)), async (district, type) => {
      requested.push(`${district}:${type ?? "all"}`);
      if (district !== 1) return page(0, []);
      if (!type) return page(7, schools.slice(0, 6));
      if (type === 3) return page(4, schools.slice(0, 4));
      if (type === 4) return page(3, schools.slice(4));
      return page(0, []);
    });
    expect(result.items).toHaveLength(7);
    expect(result.items.reduce((sum, item) => sum + Number(item.fields.places), 0)).toBe(28);
    expect(new Set(result.items.map(item => item.fields.schoolId)).size).toBe(7);
    expect(requested).toContain("1:3");
    expect(requested).toContain("1:4");
    expect(result.completeness).toBe("uncertain");
  });

  it("rejects a short page or totals that no longer reconcile", async () => {
    expect(() => parseFirstGradePage(page(7, schools.slice(0, 5)))).toThrow("result page is incomplete");
    const missingRow = page(2, schools.slice(0, 2)).replace(/<div class="school-table-txt1"><strong>1<\/strong><strong>1<\/strong><strong>0<\/strong><\/div>/u, "");
    expect(() => parseFirstGradePage(missingRow)).toThrow("school totals missing");
    await expect(collectFirstGradeVacancies(page(7, schools.slice(0, 6)), async (district, type) => {
      if (district !== 1) return page(0, []);
      if (!type) return page(7, schools.slice(0, 6));
      if (type === 3) return page(4, schools.slice(0, 4));
      if (type === 4) return page(3, schools.slice(4).map((school, index) => index === 0 ? { ...school, places: 20 } : school));
      return page(0, []);
    })).rejects.toThrow("school rows do not reconcile");
  });

  it("keeps stable school keys for a correction and exposes removal without inventing a cancellation", async () => {
    async function collect(rows: School[], places: number) {
      return collectFirstGradeVacancies(page(rows.length, rows.slice(0, 6), places), async district =>
        district === 1 ? page(rows.length, rows.slice(0, 6), places) : page(0, []));
    }
    const original = await collect(schools.slice(0, 6), 21);
    const corrected = await collect(schools.slice(0, 6).map((school, index) => index === 0 ? { ...school, places: 2 } : school), 22);
    expect(corrected.items[0]?.key).toBe(original.items[0]?.key);
    expect(corrected.items[0]?.fingerprint).not.toBe(original.items[0]?.fingerprint);
    expect(corrected.items[1]?.fingerprint).toBe(original.items[1]?.fingerprint);

    const reduced = await collect(schools.slice(1, 6), 20);
    expect(reduced.items).toHaveLength(5);
    expect(reduced.items.some(item => item.key === original.items[0]?.key)).toBe(false);
    expect(reduced.completeness).toBe("uncertain");
  });
});
