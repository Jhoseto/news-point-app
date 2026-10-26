import { describe, expect, it } from "vitest";
import { parsePilotPage } from "./parse";

const groups = [["Централен", 22], ["Северен", 13], ["Източен", 11], ["Южен", 18], ["Западен", 11], ["Тракия", 13]] as const;
function listing(options: { brokenId?: number; missingPhone?: number } = {}): string {
  let current = 0;
  const boxes = groups.map(([district, count]) => {
    const rows = Array.from({ length: count }, () => {
      current++;
      const id = current === options.brokenId ? 1 : current;
      const phone = current === options.missingPhone ? "" : "032/635-311";
      const name = current % 2 ? `ДГ "Градина ${current}"` : `ДЯ "Ясла ${current}"`;
      return `<tr><td><a href="https://dz-priem.plovdiv.bg/school_details/${id}">${name}</a></td><td>${district}, УЛ.ПРИМЕР ${current}</td><td>${phone}</td><td></td></tr>`;
    }).join("");
    return `<li class="box-list-item"><h2>Район "${district}"</h2><table aria-label="Списък с детски заведения в район ${district}"><thead><tr><th>Детско заведение</th><th>Адрес</th><th>Телефон</th><th>Брой свободни места</th></tr></thead><tbody>${rows}</tbody></table></li>`;
  }).join("");
  return `<h1>Детски заведения</h1>${boxes}`;
}

describe("municipal kindergarten and nursery directory", () => {
  it("retains separate building IDs and contact fields without claiming vacancies", () => {
    const snapshot = parsePilotPage("dz-institutions", listing());
    expect(snapshot.items).toHaveLength(88);
    expect(snapshot.items[0]?.fields).toMatchObject({ institutionId: "1", district: "Централен", type: "Детска градина" });
    expect(snapshot.items[0]?.fields).not.toHaveProperty("availablePlaces");
    expect(snapshot.completeness).toBe("uncertain");
  });

  it("rejects duplicate IDs and missing contacts", () => {
    expect(() => parsePilotPage("dz-institutions", listing({ brokenId: 2 }))).toThrow("duplicate key");
    expect(() => parsePilotPage("dz-institutions", listing({ missingPhone: 2 }))).toThrow("incomplete institution contact");
  });
});
