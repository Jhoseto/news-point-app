import { describe, expect, it } from "vitest";
import { parseKaratPlovdivSofia } from "./intercity";

// Explicit structural fixtures based on the public GET page; not live service data.
function row(id = "18", date = "31-10-2026", time = "13:00", arrivalDate = date, arrivalTime = "15:20", buyLink = true) {
  const iso = (value: string) => value.split("-").reverse().join("-");
  return `<div class="ticket-item ticket-list-item-l ticket-list-item-l-${id}">
    <div class="ticket-info">
      <div><h4>Пловдив</h4><span class="small">(Пловдив Централна ЖП гара)</span></div>
      <div><h4>София</h4><span class="small">(София)</span></div>
      <div class="small muted">Тръгване</div><div class="small muted text-center">Продължителност</div><div class="small muted text-end">Пристигане</div>
      <div class="bold">${time} ч.<br>${date}</div><div class="bold text-center">2h&nbsp;20m</div><div class="bold text-end">${arrivalTime} ч.<br>${arrivalDate}</div>
    </div>${buyLink ? `<a class="select-lroute" data-id="${id}" data-departure-date="${iso(date)}" data-departure-time="${time}:00" data-arrival-date="${iso(arrivalDate)}" data-arrival-time="${arrivalTime}:00" data-city-from-name="Пловдив" data-city-to-name="София" data-station-from-name="Пловдив Централна ЖП гара" data-station-to-name="София">Купи билет</a>` : ""}
  </div>`;
}
function page(rows = row(), date = "31-10-2026") {
  return `<h1>Автобус Пловдив - София</h1><form id="search-form"><input name="departure_date" value="${date}"></form>
    <a class="date-around-select active" data-type="l" data-date="${date}"></a><div id="tickets-l">${rows}</div>`;
}

describe("Karat-S dated intercity listing", () => {
  it("preserves the selected future date and exact station, without claiming carrier or complete coverage", () => {
    const snapshot = parseKaratPlovdivSofia(page());
    expect(snapshot.sourceId).toBe("karat-plovdiv-sofia");
    expect(snapshot.completeness).toBe("uncertain");
    expect(snapshot.items[0]?.fields).toEqual({ date: "2026-10-31", time: "13:00", arrivalDate: "2026-10-31", arrivalTime: "15:20", origin: "Пловдив", destination: "София", departureStation: "Пловдив Централна ЖП гара", arrivalStation: "София", publisher: "Карат-С / Citylines" });
    expect(snapshot.items[0]?.key).toBe("2026-10-31:18");
    expect(snapshot.items[0]?.sourceUrl).toBe("https://karat-s.com/bus/plovdiv-sofia");
  });

  it("includes a published course without a booking link and detects changes under stable identity", () => {
    const original = parseKaratPlovdivSofia(page()).items[0]!;
    const unavailable = parseKaratPlovdivSofia(page(row("18", "31-10-2026", "13:00", "31-10-2026", "15:20", false))).items[0]!;
    expect(unavailable).toEqual(original);
    const changed = parseKaratPlovdivSofia(page(row("18", "31-10-2026", "13:10"))).items[0]!;
    expect(changed.key).toBe(original.key);
    expect(changed.fingerprint).not.toBe(original.fingerprint);
  });

  it("preserves arrival on the next calendar day", () => {
    const snapshot = parseKaratPlovdivSofia(page(row("18", "31-10-2026", "23:00", "01-11-2026", "01:20")));
    expect(snapshot.items[0]?.fields.arrivalDate).toBe("2026-11-01");
  });

  it("rejects disagreement between selected date, course dates and machine-readable course attributes", () => {
    expect(() => parseKaratPlovdivSofia(page(row(), "30-10-2026"))).toThrow("differs from selected");
    expect(() => parseKaratPlovdivSofia(page().replace('data-date="31-10-2026"', 'data-date="30-10-2026"'))).toThrow("selected dates disagree");
    for (const [before, after] of [
      ['data-departure-date="2026-10-31"', 'data-departure-date="2026-11-01"'],
      ['data-departure-time="13:00:00"', 'data-departure-time="14:00:00"'],
      ['data-station-from-name="Пловдив Централна ЖП гара"', 'data-station-from-name="Автогара Юг"'],
      ['data-id="18"', 'data-id="19"'],
    ]) expect(() => parseKaratPlovdivSofia(page().replace(before!, after!))).toThrow("disagree");
  });

  it("rejects invalid dates, hours and arrival intervals", () => {
    for (const date of ["31-02-2026", "29-02-2027", "00-10-2026", "31-13-2026"]) {
      expect(() => parseKaratPlovdivSofia(page(row("18", date), date))).toThrow("invalid date");
    }
    expect(parseKaratPlovdivSofia(page(row("18", "29-02-2028"), "29-02-2028")).items).toHaveLength(1);
    for (const time of ["24:00", "13:60", "-1:00"]) expect(() => parseKaratPlovdivSofia(page(row("18", "31-10-2026", time)))).toThrow("invalid time");
    expect(() => parseKaratPlovdivSofia(page(row("18", "31-10-2026", "16:00")))).toThrow("invalid arrival");
  });

  it("fails closed on missing or changed structure rather than interpreting emptiness as no buses", () => {
    for (const [before, after] of [
      ["Автобус Пловдив - София", "Автобус София - Пловдив"],
      ['id="search-form"', 'id="other"'], ['id="tickets-l"', 'id="other"'],
      ['name="departure_date"', 'name="other"'], ["Тръгване", "Пристигане"],
      ["(Пловдив Централна ЖП гара)", ""], ["ticket-list-item-l-18", "ticket-list-item-l-unknown"],
      ["<h4>Пловдив</h4>", "<h4>Варна</h4>"],
    ]) expect(() => parseKaratPlovdivSofia(page().replace(before!, after!))).toThrow();
    expect(() => parseKaratPlovdivSofia(page(""))).toThrow("empty listing is not proof");
  });

  it("bounds external input and rejects duplicate or ambiguous courses", () => {
    expect(() => parseKaratPlovdivSofia(page(row() + row()))).toThrow("duplicate published course");
    expect(() => parseKaratPlovdivSofia(page(Array.from({ length: 61 }, (_, i) => row(String(i + 1))).join("")))).toThrow("course count");
    expect(() => parseKaratPlovdivSofia(" ".repeat(500_001))).toThrow("page exceeds");
    expect(() => parseKaratPlovdivSofia(page().replace('class="date-around-select active"', 'class="date-around-select"'))).toThrow("selected date missing");
  });
});
