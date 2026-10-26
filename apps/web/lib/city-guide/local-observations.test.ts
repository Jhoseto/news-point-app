import { describe, expect, it } from "vitest";
import { selectCityObservations } from "./local-observations";

const now = new Date("2026-10-24T16:00:00.000Z");

function preview(sourceId: string, source: {
  checkedAt?: string;
  outcome?: "observed" | "unavailable";
  items: { key: string; fields: Record<string, string | number> }[];
}) {
  return { version: 1 as const, sources: {
    [sourceId]: {
      checkedAt: source.checkedAt ?? "2026-10-24T15:50:00.000Z",
      outcome: source.outcome ?? "observed" as const,
      completeness: "uncertain" as const,
      limitations: [],
      items: source.items,
    },
  } };
}

describe("local city observations", () => {
  it("shows only open management competitions with a verified deadline", () => {
    const row = { key: "pdf:manager", fields: { title: "Обява за конкурс", company: "ЕКОБУС ПЛОВДИВ", published: "2026-10-02", deadline: "2026-11-02", time: "17:00", place: "Деловодство на Община Пловдив, пл. „Стефан Стамболов“ № 1" } };
    const checkedAt = "2026-10-26T06:00:00.000Z";
    expect(selectCityObservations("municipality", preview("plovdiv-management-competitions", { checkedAt, items: [row] }), new Date(checkedAt))[0]?.items).toEqual([row]);
    expect(selectCityObservations("municipality", preview("plovdiv-management-competitions", { checkedAt: "2026-11-03T06:00:00.000Z", items: [row] }), new Date("2026-11-03T06:00:00.000Z"))).toEqual([]);
    expect(selectCityObservations("municipality", preview("plovdiv-management-competitions", { checkedAt, outcome: "unavailable", items: [row] }), new Date(checkedAt))).toEqual([]);
  });
  it("reuses only explicitly named live music and stand-up events in the night guide", () => {
    const items = [
      { key: "live", fields: { title: "Me and My Devil - Live at Rock Bar", date: "2026-11-06", time: "21:00", place: "Rock Bar", address: "Пловдив" } },
      { key: "standup", fields: { title: "Stand-up Comedy: Всичко не е наред", date: "2026-11-08", time: "20:00", place: "Event Center", address: "Пловдив" } },
      { key: "other", fields: { title: "Нощта на предприемачите", date: "2026-11-18", time: "19:00", place: "Piano Bar", address: "Пловдив" } },
    ];
    const source = preview("epaygo-plovdiv-explicit", { items });
    expect(selectCityObservations("culture", source, now)[0]?.items.map(item => item.key)).toEqual(["live", "standup", "other"]);
    expect(selectCityObservations("nightlife", source, now)[0]?.items.map(item => item.key)).toEqual(["live", "standup"]);
    expect(selectCityObservations("nightlife", preview("epaygo-plovdiv-explicit", { items: [items[2]!] }), now)).toEqual([]);
    expect(selectCityObservations("nightlife", preview("epaygo-plovdiv-explicit", { items, outcome: "unavailable" }), now)).toEqual([]);
  });
  it("shows only active municipal consultations with a future verified deadline", () => {
    const row = { key: "12790", fields: { title: "Проект на наредба", number: "12790-K", email: "info@plovdiv.bg", ways: "Портал\nЕлектронна поща\nСигурно връчване\nКореспонденция", status: "Активна", opened: "2026-10-09", deadline: "2026-11-09" } };
    const checkedAt = "2026-10-26T05:20:00.000Z";
    expect(selectCityObservations("municipality", preview("plovdiv-public-consultations", { checkedAt, items: [row] }), new Date(checkedAt))[0]?.items).toEqual([row]);
    expect(selectCityObservations("municipality", preview("plovdiv-public-consultations", { checkedAt: "2026-11-10T05:20:00.000Z", items: [row] }), new Date("2026-11-10T05:20:00.000Z"))).toEqual([]);
    expect(selectCityObservations("municipality", preview("plovdiv-public-consultations", { checkedAt, outcome: "unavailable", items: [row] }), new Date(checkedAt))).toEqual([]);
  });
  it("keeps only dated Youth Center events with a fresh successful check", () => {
    const item = { key: "event:one", fields: { title: "Младежки форум", published: "2026-10-15", date: "2026-11-06", endDate: "2026-11-08", time: "", place: "Младежки център Пловдив" } };
    const checkedAt = "2026-10-26T06:00:00.000Z";
    expect(selectCityObservations("nightlife", preview("plovdiv-youth-centre", { checkedAt, items: [item] }), new Date(checkedAt))[0]?.items).toEqual([item]);
    expect(selectCityObservations("nightlife", preview("plovdiv-youth-centre", { checkedAt: "2026-11-09T06:00:00.000Z", items: [item] }), new Date("2026-11-09T06:00:00.000Z"))).toEqual([]);
    expect(selectCityObservations("nightlife", preview("plovdiv-youth-centre", { checkedAt, outcome: "unavailable", items: [item] }), new Date(checkedAt))).toEqual([]);
  });
  it("shows only open auction notices from the termination-aware snapshot", () => {
    const row = { key: "pdf:one", fields: { title: "Обява за търг за терен", published: "2026-10-14", deadline: "2026-10-28", auctionDate: "2026-10-30" } };
    const checkedAt = "2026-10-26T06:00:00.000Z";
    expect(selectCityObservations("municipality", preview("plovdiv-auction-list", { checkedAt, items: [row] }), new Date(checkedAt))[0]?.items).toEqual([row]);
    expect(selectCityObservations("municipality", preview("plovdiv-auction-list", { checkedAt: "2026-10-29T06:00:00.000Z", items: [row] }), new Date("2026-10-29T06:00:00.000Z"))).toEqual([]);
    expect(selectCityObservations("municipality", preview("plovdiv-auction-list", { checkedAt, outcome: "unavailable", items: [row] }), new Date(checkedAt))).toEqual([]);
  });
  it("expires annual tax deadlines and waits for a new-year notice", () => {
    const rows = [{ key: "2026:annual-second", fields: { year: "2026", label: "Втора вноска", dueDate: "2026-11-02" } }];
    const checkedAt = "2026-10-26T05:00:00.000Z";
    const result = (date: string, outcome: "observed" | "unavailable" = "observed") =>
      selectCityObservations("municipality", preview("plovdiv-tax-notices", { checkedAt: date, outcome, items: rows }), new Date(date))[0]?.items.map(item => item.key);
    expect(result(checkedAt)).toEqual(["2026:annual-second"]);
    expect(selectCityObservations("municipality", preview("plovdiv-tax-notices", { checkedAt, items: [{ ...rows[0]!, fields: { ...rows[0]!.fields, dueDate: "2026-11-03" } }] }), new Date(checkedAt))[0]?.items[0]?.fields.dueDate).toBe("2026-11-03");
    expect(result("2026-11-03T05:00:00.000Z")).toEqual([]);
    expect(result("2027-01-01T05:00:00.000Z")).toEqual([]);
    expect(result(checkedAt, "unavailable")).toEqual([]);
    const nextYear = { key: "2027:annual-second", fields: { year: "2027", label: "Втора вноска", dueDate: "2027-11-02" } };
    expect(selectCityObservations("municipality", preview("plovdiv-tax-notices", { checkedAt: "2027-01-01T05:00:00.000Z", items: [...rows, nextYear] }), new Date("2027-01-01T05:00:00.000Z"))[0]?.items).toEqual([nextYear]);
  });
  it("keeps the permanent tax office directory only while its own daily check succeeds", () => {
    const row = { key: "desk:ЮЖЕН", fields: { label: "Каса „ЮЖЕН“", address: "бул. „Македония“ №73А", hours: "08.30 ч. – 16.45 ч." } };
    expect(selectCityObservations("municipality", preview("plovdiv-taxes", { items: [row] }), now)[0]?.items).toEqual([row]);
    expect(selectCityObservations("municipality", preview("plovdiv-taxes", { outcome: "unavailable", items: [row] }), now)[0]?.items).toEqual([]);
  });
  it("hides municipal addresses if the daily contact check fails", () => {
    const item = { key: "main", fields: { label: "Община Пловдив", address: "пл. „Ст. Стамболов“ №1", phone: "080011232", secondPhone: "+35932656700" } };
    expect(selectCityObservations("municipality", preview("plovdiv-contacts", { items: [item] }), now)[0]?.items).toEqual([item]);
    expect(selectCityObservations("municipality", preview("plovdiv-contacts", { outcome: "unavailable", items: [item] }), now)[0]?.items).toEqual([]);
  });
  it("filters ended exhibitions and hides the listing after a failed check", () => {
    const items = [
      { key: "ended", fields: { title: "Минала", startDate: "2026-10-01", endDate: "2026-10-23", venue: "Галерия" } },
      { key: "open", fields: { title: "Текуща", startDate: "2026-10-07", endDate: "2026-10-27", venue: "Галерия" } },
    ];
    expect(selectCityObservations("culture", preview("plovdiv-gallery-current", { items }), now)[0]?.items.map(item => item.key)).toEqual(["open"]);
    expect(selectCityObservations("culture", preview("plovdiv-gallery-current", { outcome: "unavailable", items }), now)[0]?.items).toEqual([]);
  });
  it("shows the adoption guide only after a fresh successful check", () => {
    const item = { key: "bring", fields: { label: "Необходими вещи", detail: "Лична карта, нашийник и повод." } };
    expect(selectCityObservations("adopt", preview("plovdiv-adoption-guide", { items: [item] }), now)[0]?.items).toEqual([item]);
    expect(selectCityObservations("adopt", preview("plovdiv-adoption-guide", { outcome: "unavailable", items: [item] }), now)[0]?.items).toEqual([]);
    expect(selectCityObservations("adopt", preview("plovdiv-adoption-guide", { checkedAt: "2026-10-22T15:50:00.000Z", items: [item] }), now)[0]?.items).toEqual([]);
  });
  it("shows only current and future flights after a recent successful board check", () => {
    const flights = [
      { key: "arrival:2026-10-23:FR1836", fields: { direction: "arrival", date: "2026-10-23", time: "12:20", flight: "FR1836", route: "London - STN", status: "Arrived" } },
      { key: "departure:2026-10-26:FR1837", fields: { direction: "departure", date: "2026-10-26", time: "12:55", flight: "FR1837", route: "London - STN", status: "Scheduled" } },
    ];
    const recent = new Date("2026-10-26T05:00:00.000Z");
    const checkedAt = "2026-10-26T04:55:00.000Z";
    expect(selectCityObservations("transport", preview("plovdiv-airport-flights", { checkedAt, items: flights }), recent)[0]?.items.map(item => item.key)).toEqual(["departure:2026-10-26:FR1837"]);
    expect(selectCityObservations("transport", preview("plovdiv-airport-flights", { checkedAt, outcome: "unavailable", items: flights }), recent)[0]?.items).toEqual([]);
    expect(selectCityObservations("transport", preview("plovdiv-airport-flights", { checkedAt: "2026-10-26T03:00:00.000Z", items: flights }), recent)[0]?.items).toEqual([]);
  });
  it("hides ecology contacts when the municipality check fails", () => {
    const items = [{ key: "trees", fields: { label: "ОП „Градини и паркове“", reason: "Паднали дървета и опасни клони", phone: "032 624 301" } }];
    expect(selectCityObservations("environment", preview("plovdiv-eco-signals", { items }), now)[0]?.items).toEqual(items);
    expect(selectCityObservations("environment", preview("plovdiv-eco-signals", { outcome: "unavailable", items }), now)[0]?.items).toEqual([]);
  });
  it("shows transport signal phones only after a fresh complete check", () => {
    const item = { key: "traffic", fields: { label: "Център за управление на трафика", reason: "Сигнали за светофарни уредби", phone: "032/622-707" } };
    expect(selectCityObservations("municipality", preview("plovdiv-transport-signals", { items: [item] }), now)[0]?.items).toEqual([item]);
    expect(selectCityObservations("municipality", preview("plovdiv-transport-signals", { items: [{ ...item, fields: { ...item.fields, phone: "неизвестен" } }] }), now)[0]?.items).toEqual([]);
    expect(selectCityObservations("municipality", preview("plovdiv-transport-signals", { outcome: "unavailable", items: [item] }), now)[0]?.items).toEqual([]);
  });
  it("shows only future collection campaigns and hides the calendar after failed or stale checks", () => {
    const items = [
      { key: "27", fields: { title: "Кампания за опасни отпадъци", date: "2026-10-22", details: "08:30 – 14:30, бул. „Шести септември“" } },
      { key: "28", fields: { title: "Кампания за отработени масла", date: "2026-11-23", details: "09:00 – 12:00, ул. „Стою Шишков“" } },
    ];
    const current = selectCityObservations("environment", preview("ecomap-collection-events", { items }), now)[0];
    expect(current?.items.map(item => item.key)).toEqual(["28"]);
    expect(selectCityObservations("environment", preview("ecomap-collection-events", { outcome: "unavailable", items }), now)[0]?.items).toEqual([]);
    expect(selectCityObservations("environment", preview("ecomap-collection-events", { checkedAt: "2026-10-22T00:00:00.000Z", items }), now)[0]?.items).toEqual([]);
  });
  it("keeps the full EcoMap result only while its source check is current", () => {
    const items = Array.from({ length: 1768 }, (_, index) => ({ key: String(index + 1), fields: {
      type: "yellow", address: `ул. Пример ${index + 1}, Пловдив`, latitude: 42.1354, longitude: 24.7453,
    } }));
    expect(selectCityObservations("environment", preview("ecomap-containers", { items }), now)[0]?.items).toHaveLength(1768);
    expect(selectCityObservations("environment", preview("ecomap-containers", { outcome: "unavailable", items }), now)[0]?.items).toEqual([]);
    expect(selectCityObservations("environment", preview("ecomap-containers", { checkedAt: "2026-10-23T00:00:00.000Z", items }), now)[0]?.items).toEqual([]);
  });
  it("hides a heating outage after a failed source check", () => {
    const fault = { key: "heat", fields: { kind: "fault", address: "БЛ.156 ВХ.Г", issue: "Авария на топлопровод", start: "23.10.2026 12:00:00", end: "26.10.2026 20:00:00", deadline: "26.10.2026 20:00:00" } };
    expect(selectCityObservations("outages", preview("evn-heating-outages", { items: [fault] }), now)[0]?.items).toEqual([fault]);
    expect(selectCityObservations("outages", preview("evn-heating-outages", { outcome: "unavailable", items: [fault] }), now)[0]?.items).toEqual([]);
  });
  it("keeps operator contacts separate from parking rules and hides failed checks", () => {
    const row = { key: "towing", fields: { label: "Наказателен паркинг · диспечер", phone: "0884554110" } };
    expect(selectCityObservations("parking", preview("plovdiv-parking-operator", { items: [row] }), now)[0]?.items).toEqual([row]);
    expect(selectCityObservations("parking", preview("plovdiv-parking-operator", { outcome: "unavailable", items: [row] }), now)[0]?.items).toEqual([]);
  });
  it("shows GTFS routes only for the current Sofia service day", () => {
    const sunday = new Date("2026-10-25T12:00:00.000Z");
    const route = { key: "24", fields: { line: "24", name: "Автобусна линия 24", destinations: "Прослав · Устрем", serviceDate: "2026-10-25" } };
    const checkedAt = "2026-10-25T11:50:00.000Z";
    expect(selectCityObservations("transport", preview("plovdiv-livetransport-gtfs", { checkedAt, items: [route] }), sunday)[0]?.items).toEqual([route]);
    const monday = new Date("2026-10-25T22:30:00.000Z");
    expect(selectCityObservations("transport", preview("plovdiv-livetransport-gtfs", { checkedAt, items: [route] }), monday)[0]?.items).toEqual([]);
    const route2 = { key: "2", fields: { ...route.fields, line: "2" } };
    expect(selectCityObservations("transport", preview("plovdiv-livetransport-gtfs", { checkedAt, items: [route, route2] }), sunday)[0]?.items.map(item => item.key)).toEqual(["2", "24"]);
  });

  it("hides low-emission rules after a failed local check", () => {
    const row = { key: "season", fields: { label: "Период", value: "1 октомври – 30 април", detail: "Ежегодно" } };
    expect(selectCityObservations("transport", preview("plovdiv-low-emission", { items: [row] }), now)[0]?.items).toEqual([row]);
    expect(selectCityObservations("transport", preview("plovdiv-low-emission", { outcome: "unavailable", items: [row] }), now)[0]?.items).toEqual([]);
  });

  it("shows dated first-grade school rows only after an observed check", () => {
    const school = { key: "2026/2027:трето:5", fields: { schoolId: "5", school: "СУ Св. св. Кирил и Методий", district: "Западен", schoolType: "Средни училища", places: 10, sopPlaces: 0, classes: 3, year: "2026/2027", ranking: "трето" } };
    expect(selectCityObservations("education", preview("first-grade-vacancies", { items: [school] }), now)[0]?.items).toEqual([school]);
    expect(selectCityObservations("education", preview("first-grade-vacancies", { outcome: "unavailable", items: [school] }), now)[0]?.items).toEqual([]);
  });
  it("shows only today's observed ViK entries, without calling them active", () => {
    const groups = selectCityObservations("outages", preview("vik-outages", { items: [
      { key: "today", fields: { date: "24.10.2026 г.", place: "Пловдив" } },
      { key: "old", fields: { date: "23.10.2026 г.", place: "Пловдив" } },
    ] }), now);
    expect(groups[0]).toMatchObject({ status: "observed", completeness: "uncertain" });
    expect(groups[0]?.items.map(item => item.key)).toEqual(["today"]);
  });

  it("hides records after a failed or overdue check", () => {
    const item = { key: "1", fields: { date: "24.10.2026 г.", place: "Пловдив" } };
    expect(selectCityObservations("outages", preview("vik-outages", { outcome: "unavailable", items: [item] }), now)[0]).toMatchObject({ status: "unavailable", items: [] });
    expect(selectCityObservations("outages", preview("vik-outages", { checkedAt: "2026-10-24T13:00:00.000Z", items: [item] }), now)[0]).toMatchObject({ status: "stale", items: [] });
  });

  it("removes past performances and uncertain yearless club listings", () => {
    const opera = selectCityObservations("culture", preview("plovdiv-opera", { items: [
      { key: "past", fields: { title: "Минало", date: "2026-10-23", location: 'Дом на културата "Борис Христов"' } },
      { key: "invalid", fields: { title: "Грешна дата", date: "2026-99-99", location: 'Дом на културата "Борис Христов"' } },
      { key: "tour", fields: { title: "Семирамида", date: "2026-12-21", location: "Софийска опера и балет" } },
      { key: "future", fields: { title: "Предстоящо", date: "2026-10-26", location: 'Дом на културата "Борис Христов"' } },
    ] }), now);
    expect(opera[0]?.items.map(item => item.key)).toEqual(["future"]);
    const club = selectCityObservations("nightlife", preview("club-code-upcoming", { items: [
      { key: "club", fields: { title: "Концерт", dateText: "Sat 24 Oct, 23:00" } },
    ] }), now);
    expect(club[0]?.items).toEqual([]);
    const enriched = selectCityObservations("nightlife", preview("club-code-upcoming", { items: [
      { key: "club", fields: { title: "Концерт", startDate: "2026-10-24T23:00:00+03:00", endDate: "2026-10-25T06:00:00+02:00", place: "Club Code", status: "EventScheduled" } },
    ] }), now);
    expect(enriched[0]?.items.map(item => item.key)).toEqual(["club"]);
  });
});
