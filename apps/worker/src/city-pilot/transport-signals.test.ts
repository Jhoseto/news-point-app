import { describe, expect, it } from "vitest";
import { parsePilotPage } from "./parse";

const page = (phone = "032/622-550") => `<div id="content"><h1>ОП „Организация и контрол по транспорта”</h1><p>Контакти:</p><p>${phone} – Градски транспорт;<br>032/622-707 – Център за управление на трафика;<br>032/620 330 – Улично осветление</p></div>`;

describe("transport signal contacts", () => {
  it("keeps three distinct municipal phone records and versions a corrected number", () => {
    const before = parsePilotPage("plovdiv-transport-signals", page());
    expect(before.items.map(item => item.key)).toEqual(["buses", "traffic", "lighting"]);
    expect(before.items[2]?.fields.phone).toBe("032/620 330");
    const after = parsePilotPage("plovdiv-transport-signals", page("032/622-551"));
    expect(after.items[0]?.fields.phone).toBe("032/622-551");
    expect(after.items[0]?.fingerprint).not.toBe(before.items[0]?.fingerprint);
  });

  it("rejects a missing line or changed page structure", () => {
    expect(() => parsePilotPage("plovdiv-transport-signals", page().replace("Център за управление на трафика", "Друго звено"))).toThrow("changed traffic contact");
    expect(() => parsePilotPage("plovdiv-transport-signals", page().replace("Контакти:", "Други контакти"))).toThrow("changed buses contact");
  });
});
