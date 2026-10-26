import { describe, expect, it } from "vitest";
import { parsePilotPage } from "./parse";

const html = `<div id="content">
  <h1>Телефони за сигнали</h1>
  <p>Гореща линия на Пловдивски общински инспекторат – „Зелен телефон“ 6-111</p>
  <p>РИОСВ Пловдив „зелен“ телефон 032 643245</p>
  <p>Басейнова дирекция ИБР „син“ телефон 032 621 552</p>
  <p>ОП „Зооветеринарен комплекс“ 032 966 184 – телефон за сигнали и заявки</p>
  <p>ОП „Градини и паркове“ 032 624 301</p>
  <ul><li>Нередовно обслужване на контейнери;</li><li>Нередовно почистване на уличната мрежа;</li><li>Запушени дъждоприемни шахти.</li></ul>
  <p>ОП „Чистота“ 032 675 817</p>
  <p>ОП „Дезинфекционна станция“ 032 990 318</p>
</div>`;

describe("municipal ecology signal contacts", () => {
  it("keeps seven published phones with distinct reasons", () => {
    const snapshot = parsePilotPage("plovdiv-eco-signals", html);
    expect(snapshot.items).toHaveLength(7);
    expect(snapshot.items.find(item => item.key === "trees")?.fields).toMatchObject({ phone: "032 624 301", reason: "Паднали дървета и опасни клони" });
    expect(snapshot.completeness).toBe("uncertain");
  });

  it("rejects a missing phone or changed scope", () => {
    expect(() => parsePilotPage("plovdiv-eco-signals", html.replace("032 624 301", ""))).toThrow("trees phone");
    expect(() => parsePilotPage("plovdiv-eco-signals", html.replace("дъждоприемни шахти", "други дейности"))).toThrow("cleaning topics changed");
  });

  it("updates a published number without changing the institution identity", () => {
    const changed = parsePilotPage("plovdiv-eco-signals", html.replace("032 624 301", "032 624 302"));
    expect(changed.items.find(item => item.key === "trees")?.fields.phone).toBe("032 624 302");
    expect(changed.items.find(item => item.key === "trees")?.fingerprint).not.toBe(parsePilotPage("plovdiv-eco-signals", html).items.find(item => item.key === "trees")?.fingerprint);
  });
});
