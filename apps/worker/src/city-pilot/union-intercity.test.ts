import { describe, expect, it } from "vitest";
import { parseUnionIntercity, type UnionIntercityRoute } from "./union-intercity";

const burgas: UnionIntercityRoute = { sourceId: "union-plovdiv-burgas", destination: "Бургас", destinationId: "23" };
const varna: UnionIntercityRoute = { sourceId: "union-plovdiv-varna", destination: "Варна", destinationId: "29" };
const dmy = (date: string) => date.split("-").reverse().join("-");
// Small synthetic fixtures of the observed public structure. These are not live schedules.
function row(route = burgas, options: { date?: string; arrivalDate?: string; time?: string; arrivalTime?: string; station?: string; fromStation?: string; toStation?: string; course?: string } = {}) {
  const { date = "2026-10-31", arrivalDate = date, time = "06:45", arrivalTime = "11:00", station = "Юг автогара", fromStation = "22", toStation = route === varna ? "87" : "33", course = "3709" } = options;
  const leg = `${course}-128-${fromStation}-${toStation}`;
  return `<div class="tickets-results-item lroute-select" id="lroute-select-${leg}">
    <div class="result-item-start-point-data"><div class="result-item-city">Пловдив<br>${station}</div><div class="result-item-time">${time}</div><span class="data-label">${date}</span></div>
    <div class="result-item-duration"><span class="result-item-duration-label-title">директен</span></div>
    <div class="result-item-end-point-data"><div class="result-item-city">${route.destination}<br>${route === varna ? "Държавна Автогара" : "Запад автогара"}</div><div class="result-item-time">${arrivalTime}</div><span class="data-label">${dmy(arrivalDate)}</span></div>
    <a class="select-lroute" data-id="${course}" data-leave="${time}:00" data-arrive="${arrivalTime}:00" data-from="128" data-to="${route.destinationId}" data-from-station="${fromStation}" data-to-station="${toStation}" data-select-id="${leg}" data-multilink="0">Избери</a>
  </div>`;
}
function page(route = burgas, rows = row(route), date = "2026-10-31") {
  return `<form method="POST" action="https://union-ivkoni.com/bg/routes"><select name="from"><option value="128" selected>Пловдив</option></select><select name="to"><option value="${route.destinationId}" selected>${route.destination}</option></select><input id="dateStart" name="sdate" value="${dmy(date)}"></form>
    <h3><div class="result-title-text">Намерени билети: <span></span>Пловдив - ${route.destination}</div><span class="results-title-date">${dmy(date)}</span></h3><div id="lroutes-list">${rows}</div>
    <h3><div class="result-title-text">Намерени билети: ${route.destination} - Пловдив</div></h3><div id="rroutes-list">return listing is outside the parser scope</div>`;
}
const parse = (html = page(), route = burgas, date = "2026-10-31") => parseUnionIntercity(html, route, date);
const withoutPurchase = (html: string) => html.replace(/<a class="select-lroute"[^>]*>Избери<\/a>/u, '<div class="results-item-right">заминал</div>');
function transfer() {
  return withoutPurchase(row(varna, { time: "16:45", arrivalDate: "2026-11-01", arrivalTime: "02:00", fromStation: "21", toStation: "87", course: "3943" }))
    .replace("lroute-select-3943-128-21-87", "lroute-select-3943-128-21-15---1697-161-16-87")
    .replace('class="result-item-duration-label-title">директен', 'class="result-item-duration-label-title">с прекачване</span><span class="result-item-duration-label-title">време на изчакване в София: 0:30</span><span class="result-item-duration-label-title">Продължителност')
    .replace("заминал", "не може да бъде закупен онлайн");
}

describe("Union Ivkoni public dated intercity search", () => {
  it("preserves factual fields and separates two legs sharing one published course ID", () => {
    const a = parse(), b = parse(page(varna, row(varna, { arrivalTime: "14:00" })), varna);
    expect(a).toMatchObject({ sourceId: burgas.sourceId, completeness: "uncertain" });
    expect(a.items[0]?.fields).toEqual({ date: "2026-10-31", time: "06:45", arrivalDate: "2026-10-31", arrivalTime: "11:00", origin: "Пловдив", destination: "Бургас", departureStation: "Юг автогара", arrivalStation: "Запад автогара", publisher: "Юнион Ивкони" });
    expect(a.items[0]?.sourceUrl).toBe("https://union-ivkoni.com/bg/routes");
    expect(a.items[0]?.key).toBe("2026-10-31:3709:128:23:22:33");
    expect(b.items[0]?.key).toBe("2026-10-31:3709:128:29:22:87");
  });

  it("preserves exact North-station labels and fingerprints updates under the same leg", () => {
    const outside = parse(page(burgas, row(burgas, { station: "пред автогара Север", fromStation: "66" }))).items[0]!;
    const terminal = parse(page(burgas, row(burgas, { station: "Север автогара", fromStation: "21" }))).items[0]!;
    expect(outside.fields.departureStation).toBe("пред автогара Север");
    expect(terminal.fields.departureStation).toBe("Север автогара");
    expect(outside.key).not.toBe(terminal.key);
    const changed = parse(page(burgas, row(burgas, { time: "06:50" }))).items[0]!;
    expect(changed.key).toBe(parse().items[0]?.key);
    expect(changed.fingerprint).not.toBe(parse().items[0]?.fingerprint);
  });

  it("preserves a published direct course after its purchase button disappears", () => {
    const original = parse().items[0]!;
    expect(parse(page(burgas, withoutPurchase(row()))).items[0]).toEqual(original);
    expect(() => parse(page(burgas, withoutPurchase(row()).replace("lroute-select-3709-128-22-33", "unknown")))).toThrow("direct course identity");
    expect(() => parse(page(burgas, withoutPurchase(row()).replace("Бургас<br>", "Варна<br>")))).toThrow("direction changed");
    expect(() => parse(page(burgas, withoutPurchase(row()).replace("2026-10-31</span>", "2026-10-30</span>")))).toThrow("course date differs");
  });

  it("excludes explicitly verified connections without losing direct courses or inventing no-service evidence", () => {
    const result = parse(page(varna, transfer()), varna);
    expect(result.items).toEqual([]);
    expect(result.completeness).toBe("uncertain");
    expect(result.limitations.join(" ")).toContain("1 explicitly dated transfer");
    const mixed = parse(page(varna, transfer() + row(varna, { arrivalTime: "14:00" })), varna);
    expect(mixed.items).toHaveLength(1);
    expect(mixed.items[0]?.fields.time).toBe("06:45");
  });

  it("does not treat a corrupted or unlabelled connection as a valid empty direct listing", () => {
    for (const [before, after] of [
      ["с прекачване", "неизвестен"], ["време на изчакване в София: 0:30", "неизвестно изчакване"],
      ["3943-128-21-15---1697-161-16-87", "3943-128-21-87"],
      ["3943-128-21-15---1697-161-16-87", "3943-161-21-15---1697-161-16-87"],
      ["Варна<br>", "Бургас<br>"], ["2026-10-31</span>", "2026-10-30</span>"],
      ["02:00</div>", "25:00</div>"],
    ]) expect(() => parse(page(varna, transfer().replace(before!, after!)), varna)).toThrow();
  });

  it("requires the requested route in configuration, selected options, heading and each row", () => {
    expect(() => parse(page(), { ...burgas, sourceId: varna.sourceId })).toThrow("unapproved route");
    expect(() => parse(page(), { ...burgas, destinationId: "29" })).toThrow("unapproved route");
    for (const [before, after] of [["value=\"23\" selected", "value=\"29\" selected"], ["Пловдив - Бургас", "Пловдив - Варна"], ["Пловдив<br>", "Варна<br>"], ["Бургас<br>", "Варна<br>"]]) {
      expect(() => parse(page().replace(before!, after!))).toThrow();
    }
  });

  it("requires caller, input, result heading and every row to agree on a real calendar day", () => {
    expect(() => parse(page(), burgas, "2026-10-30")).toThrow("selected date differs");
    expect(() => parse(page().replace('class="results-title-date">31-10-2026', 'class="results-title-date">30-10-2026'))).toThrow("result date differs");
    expect(() => parse(page(burgas, row(burgas, { date: "2026-10-30" })))).toThrow("course date differs");
    for (const date of ["2026-02-30", "2027-02-29", "2026-13-31", "2026-00-31", "31-10-2026"]) expect(() => parse(page(), burgas, date)).toThrow("invalid date");
    expect(parse(page(burgas, row(burgas, { date: "2028-02-29" }), "2028-02-29"), burgas, "2028-02-29").items).toHaveLength(1);
  });

  it("validates visible clock times, attributed times and arrival intervals including overnight travel", () => {
    expect(parse(page(burgas, row(burgas, { time: "23:00", arrivalDate: "2026-11-01", arrivalTime: "03:15" }))).items[0]?.fields.arrivalDate).toBe("2026-11-01");
    for (const time of ["24:00", "06:60", "6:45"]) expect(() => parse(page(burgas, row(burgas, { time })))).toThrow("invalid time");
    expect(() => parse(page().replace('data-leave="06:45:00"', 'data-leave="06:46:00"'))).toThrow("attributed times disagree");
    expect(() => parse(page(burgas, row(burgas, { arrivalTime: "06:45" })))).toThrow("invalid arrival interval");
    expect(() => parse(page(burgas, row(burgas, { arrivalDate: "2026-11-02" })))).toThrow("invalid arrival interval");
  });

  it("rejects missing, conflicting, indirect and duplicate course identifiers", () => {
    for (const [before, after] of [
      ['data-id="3709"', 'data-id=""'], ['data-to="23"', 'data-to="29"'], ['data-from="128"', 'data-from="29"'],
      ['data-from-station="22"', 'data-from-station="21"'], ['data-select-id="3709-128-22-33"', 'data-select-id="3709-128-22-32"'],
      ['data-multilink="0"', 'data-multilink="1"'], ['id="lroute-select-3709-128-22-33"', 'id="lroute-select-3709-128-22-32"'],
      ['class="select-lroute"', 'class="unverified"'],
    ]) expect(() => parse(page().replace(before!, after!))).toThrow();
    expect(() => parse(page(burgas, row() + row()))).toThrow("duplicate published leg");
  });

  it("fails closed on unknown empty states, missing page contracts and oversized input", () => {
    for (const [before, after] of [["https://union-ivkoni.com/bg/routes", "https://example.com"], ['id="dateStart"', 'id="unknown"'], ['id="lroutes-list"', 'id="unknown"'], ["Юг автогара", ""], ["<br>", " "]]) {
      expect(() => parse(page().replace(before!, after!))).toThrow();
    }
    expect(() => parse(page(burgas, ""))).toThrow("empty listing is not verified");
    expect(() => parse(page(burgas, "Няма резултати"))).toThrow("empty listing is not verified");
    expect(() => parse(" ".repeat(1_000_001))).toThrow("page exceeds");
    expect(() => parse(page(burgas, Array.from({ length: 101 }, (_, index) => row(burgas, { course: String(index + 1) })).join("")))).toThrow("course count");
  });
});
