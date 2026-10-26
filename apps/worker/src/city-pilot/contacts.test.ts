import { describe, expect, it } from "vitest";
import { parsePilotPage } from "./parse";

const districts = ["Централен", "Източен", "Западен", "Северен", "Южен", "Тракия"];
const page = () => `<main><p>седалище и адрес на управление: гр. Пловдив, пл. „Ст. Стамболов“ №1</p><p>телефон: 080011232 и +35932656700</p><p>6 административни района:<br>${districts.map(name => `Район „${name}“ – със седалище и адрес на управление гр. Пловдив, ул. „Пример“ № 1`).join("<br>")}</p></main>`;

describe("municipal contacts", () => {
  it("reads the city and all six district addresses with stable identities", () => {
    const before = parsePilotPage("plovdiv-contacts", page());
    const after = parsePilotPage("plovdiv-contacts", page().replace("ул. „Пример“ № 1", "ул. „Пример“ № 2"));
    expect(before.items).toHaveLength(7);
    expect(before.items[0]?.fields.phone).toBe("080011232");
    expect(before.items[1]?.fingerprint).not.toBe(after.items[1]?.fingerprint);
  });

  it("refuses a missing district or core phone", () => {
    expect(() => parsePilotPage("plovdiv-contacts", page().replace("Район „Тракия“", "Район „Друг“"))).toThrow("district contact missing");
    expect(() => parsePilotPage("plovdiv-contacts", page().replace("080011232", "няма номер"))).toThrow("core contacts missing");
  });
});
