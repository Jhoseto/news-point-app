import { afterEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { candidateSources } from "./catalog";
import { parseClubEventDetail, parseEpayGoEventDetail, parsePilotPage } from "./parse";
import { runPilotSource } from "./run";
import { previewAfterCheck } from "./preview";
import { zipSync, strToU8 } from "fflate";
import { parsePlovdivGtfsArchive } from "./gtfs";

const vik = candidateSources.find((source) => source.id === "vik-outages")!;
const time = Date.parse("2026-10-24T10:00:00Z");

function vikPage(rows: string[], date = "24.10.2026 г.") {
  return `<div class="boxServiceContent"><p class="date">${date}</p><table class="accidents"><tbody>${rows.join("")}</tbody></table></div>`;
}

function vikRow(place: string, affected = "района на аварията") {
  return `<tr><td>гр. Пловдив</td><td>${place}</td><td>авария на водопровод</td><td>${affected}</td><td>от 09:00ч. до 17:00ч.</td></tr>`;
}

function response(body: string, status = 200, headers: Record<string, string> = {}) {
  return new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8", ...headers } });
}

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("city source pilot", () => {
  it("uses the signed relay only after a configured source is blocked directly", async () => {
    const source = candidateSources.find(entry => entry.id === "lohi-programme")!;
    const html = `<main>Lo/Hi Craft Space. Rayko Daskalov 55, Plovdiv
      <article class="event" data-event="Music Quiz" data-date="2026-11-09" data-time="20:00"><h3>Music Quiz</h3><p>Участие с отбори.</p></article>
    </main>`;
    vi.stubEnv("CITY_SOURCE_RELAY_URL", "https://newspoint.bg/city-source-relay/v1");
    vi.stubEnv("CITY_SOURCE_RELAY_SECRET", "s".repeat(64));
    const fetchMock = vi.fn().mockResolvedValueOnce(response("blocked", 403, { "cf-mitigated": "challenge" }))
      .mockResolvedValueOnce(response(html, 200, { "x-np-relay-final-url": source.url }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await runPilotSource(source, { failures: 0, items: {} }, time);
    expect(result.journal.outcome).toBe("parsed");
    expect(result.snapshot?.items).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const relayRequest = fetchMock.mock.calls[1]?.[0] as URL;
    const relayInit = fetchMock.mock.calls[1]?.[1] as RequestInit;
    expect(relayRequest.toString()).toBe("https://newspoint.bg/city-source-relay/v1");
    expect(relayInit.headers).toMatchObject({ "x-np-city-timestamp": expect.any(String), "x-np-city-signature": expect.stringMatching(/^[a-f0-9]{64}$/u) });
  });
  it("honours Retry-After from a required PDF without refreshing a previous snapshot", async () => {
    const source = candidateSources.find(entry => entry.id === "plovdiv-low-emission-permit")!;
    const listing = '<div id="content"><h1>Бланки и формуляри</h1><p>Зона с ниски емисии:</p><p><a href="/wp-content/uploads/2026/09/info.pdf">Информация</a></p><p><a href="/wp-content/uploads/2026/09/form.pdf">Заявление</a></p><p>Синя зона:</p></div>';
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(response(listing)).mockResolvedValueOnce(response("rate limited", 429, { "retry-after": "172800" })));
    const result = await runPilotSource(source, { failures: 0, items: { old: "hash" }, lastSuccessAt: "2026-10-23T10:00:00.000Z" }, time);
    expect(result.journal.outcome).toBe("failed");
    expect(result.journal.error).toContain("HTTP 429");
    expect(result.state.nextDueAt).toBe(new Date(time + 172800000).toISOString());
    expect(result.state.lastSuccessAt).toBe("2026-10-23T10:00:00.000Z");
    expect(result.snapshot).toBeUndefined();
  });
  it("tracks an edit and a missing row without treating the missing row as resolved", async () => {
    const first = vikPage([vikRow("ул. А"), vikRow("ул. Б")]);
    const second = vikPage([vikRow("ул. А", "два квартала")]);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(response(first)).mockResolvedValueOnce(response(second)));

    const a = await runPilotSource(vik, { failures: 0, items: {} }, time);
    const b = await runPilotSource(vik, a.state, time + 30 * 60_000);

    expect(a.journal.outcome).toBe("parsed");
    expect((a.journal.changes as { added: string[] }).added).toHaveLength(2);
    expect((b.journal.changes as { changed: string[]; missing: string[] }).changed).toHaveLength(1);
    expect((b.journal.changes as { changed: string[]; missing: string[] }).missing).toHaveLength(1);
    expect(b.journal.completeness).toBe("uncertain");
  });

  it("separates a new dated ViK bulletin from disappearing same-day records", async () => {
    const oldBulletin = vikPage([vikRow("ул. А"), vikRow("ул. Б")]);
    const newBulletin = vikPage([vikRow("ул. В")], "25.10.2026 г.");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(response(oldBulletin)).mockResolvedValueOnce(response(newBulletin)));
    const first = await runPilotSource(vik, { failures: 0, items: {} }, time);
    const second = await runPilotSource(vik, first.state, time + 24 * 60 * 60_000);
    expect(first.state.partition).toBe("24.10.2026 г.");
    expect(second.state.partition).toBe("25.10.2026 г.");
    expect(second.journal.partitionRollover).toMatchObject({ from: "24.10.2026 г.", to: "25.10.2026 г.", previousCount: 2 });
    expect(second.journal.changes).toEqual({ added: [second.snapshot!.items[0]!.key], changed: [], missing: [] });
  });

  it("preserves the last valid snapshot on a broken table and backs off", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(vikPage(["<tr><td>гр. Пловдив</td></tr>"]))));
    const previous = { failures: 0, items: { existing: "fingerprint" }, bodyHash: "old", lastParsedAt: "2026-10-24T09:00:00Z" };
    const result = await runPilotSource(vik, previous, time);
    expect(result.journal.outcome).toBe("failed");
    expect(result.state.items).toEqual(previous.items);
    expect(result.state.lastParsedAt).toBe(previous.lastParsedAt);
    expect(Date.parse(result.state.nextDueAt!)).toBeGreaterThan(time + 30 * 60_000);
  });

  it("uses a validated prior snapshot for 304 and honours Retry-After on 429", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response(null, { status: 304 })).mockResolvedValueOnce(response("busy", 429, { "retry-after": "7200" })));
    const previous = { failures: 0, items: { x: "hash" }, bodyHash: "old", lastParsedAt: "2026-10-24T09:00:00Z" };
    const unchanged = await runPilotSource(vik, previous, time);
    const limited = await runPilotSource(vik, unchanged.state, time + 30 * 60_000);
    expect(unchanged.journal.outcome).toBe("unchanged");
    expect(limited.journal.outcome).toBe("failed");
    expect(Date.parse(limited.state.nextDueAt!)).toBeGreaterThanOrEqual(time + 30 * 60_000 + 7200_000);
  });

  it("rejects an unexpected redirect host", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 302, headers: { location: "https://elsewhere.example/" } })));
    const result = await runPilotSource(vik, { failures: 0, items: {} }, time);
    expect(result.journal.outcome).toBe("failed");
    expect(result.journal.error).toBe("redirect left the source HTTPS host");
  });

  it("keeps distinct opera performances on the same date when times differ", () => {
    const card = (clock: string) => `<div class="row card event" data-id="2026-October"><div class="date"><span>30</span>/<span>10</span></div><div class="time"><span>${clock}</span></div><h5 class="title">Турандот</h5><div class="location">Опера Пловдив</div><a href="/bg/performance/details?id=549">Виж повече</a></div>`;
    const snapshot = parsePilotPage("plovdiv-opera", card("11:00") + card("19:00"));
    expect(snapshot.items).toHaveLength(2);
    expect(snapshot.items.map((entry) => entry.fields.date)).toEqual(["2026-10-30", "2026-10-30"]);
    expect(() => parsePilotPage("plovdiv-opera", card("25:00"))).toThrow("event card schema changed");
    expect(() => parsePilotPage("plovdiv-opera", card("19:00").replace("30</span>/<span>10", "31</span>/<span>02"))).toThrow("event card schema changed");
  });

  it("rejects an impossible theatre date or time instead of publishing it", () => {
    const row = (dateTime: string) => `<table id="MainContent_grdPlan"><tr><th>№</th></tr><tr><td>1</td><td>${dateTime}</td><td>Постановка</td></tr></table>`;
    expect(() => parsePilotPage("plovdiv-theatre", row("31-02-2026 г. 19:00 ч."))).toThrow("incomplete programme row");
    expect(() => parsePilotPage("plovdiv-theatre", row("25-10-2026 г. 24:00 ч."))).toThrow("incomplete programme row");
  });

  it("does not retain personal names from a council agenda item", () => {
    const html = `<div id="content-bg"><h1>Дневен ред</h1><ol><li>26XI-455 /21-10-2026 – заявление от Иван Иванов</li></ol></div>`;
    const snapshot = parsePilotPage("plovdiv-council", html);
    expect(snapshot.items[0]?.fields).toEqual({ docket: "26XI-455" });
    expect(JSON.stringify(snapshot)).not.toContain("Иван Иванов");
  });

  it("shows parsed local records only while the latest check succeeds", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(response(vikPage([vikRow("ул. А")]))).mockResolvedValueOnce(response("broken", 200)));
    const observed = await runPilotSource(vik, { failures: 0, items: {} }, time);
    const visible = previewAfterCheck(undefined, String(observed.journal.checkedAt), observed.journal.outcome, observed.snapshot);
    expect(visible.outcome).toBe("observed");
    expect(visible.items[0]?.fields.place).toBe("ул. А");
    expect(JSON.stringify(visible)).not.toContain("https://");

    const failed = await runPilotSource(vik, observed.state, time + 60 * 60_000);
    const hidden = previewAfterCheck(visible, String(failed.journal.checkedAt), failed.journal.outcome, failed.snapshot);
    expect(hidden).toMatchObject({ outcome: "unavailable", items: [] });
    expect(observed.state.items).toEqual(failed.state.items);
  });

  it("hides a previous local observation throughout a due check, then restores it after a valid 304", async () => {
    const observed = previewAfterCheck(undefined, new Date(time).toISOString(), "parsed", parsePilotPage("vik-outages", vikPage([vikRow("ул. А")])));
    const checking = previewAfterCheck(observed, new Date(time + 60_000).toISOString(), "checking");
    expect(checking).toMatchObject({ outcome: "unavailable", items: [] });
    const restored = previewAfterCheck(observed, new Date(time + 120_000).toISOString(), "unchanged");
    expect(restored).toMatchObject({ outcome: "observed", items: observed.items });
  });

  it("reparses an unchanged body when rebuilding a hidden local preview", async () => {
    const body = vikPage([vikRow("ул. А")]);
    const fetchMock = vi.fn().mockResolvedValueOnce(response(body, 200, { etag: '"v1"' }))
      .mockResolvedValueOnce(response(body));
    vi.stubGlobal("fetch", fetchMock);
    const first = await runPilotSource(vik, { failures: 0, items: {} }, time);
    const recovered = await runPilotSource(vik, first.state, time + 60 * 60_000, true);
    expect(recovered.journal.outcome).toBe("parsed");
    expect(recovered.snapshot?.items[0]?.fields.place).toBe("ул. А");
    const headers = (fetchMock.mock.calls[1]?.[1] as { headers: Headers }).headers;
    expect(headers.has("If-None-Match")).toBe(false);
  });

  it("extracts parking facts only when the essential municipal rules are present", () => {
    const html = `<div class="post-content">
      <p>SMS, съдържащ регистрационен номер на автомобила на кратък номер 1332.</p>
      <p>Стойността на самия SMS се определя на 1,02 евро + цената на съобщението.</p>
      <p>Синя зона – Пловдив работи и в събота с нормално работно време: от 8:30 до 18:30 часа.</p>
      <p>Собственици или ползватели на МПС, с постоянна адресна регистрация в обхвата на зоната;</p>
      <p>Зоната се намира в кв. „Капана“ и е заключена между улиците „Железарска“, „Йоаким Груев“ до „Княз Богориди“.</p>
    </div>`;
    const snapshot = parsePilotPage("plovdiv-parking-rules", html);
    expect(snapshot.items.map(entry => entry.fields.value)).toEqual(["1332", "1,02 евро", "8:30–18:30", "Капана", "Постоянен адрес в зоната"]);
    expect(() => parsePilotPage("plovdiv-parking-rules", html.replace("1332", ""))).toThrow("required rule changed");
  });

  it("checks a club listing against its dated event detail", () => {
    const listed = { key: "300", sourceUrl: "https://www.clubcode.bg/event/?eventid=300", fingerprint: "old", fields: { title: "Infinite Grooves", dateText: "Sat 24 Oct, 23:00 → Sun 25 Oct, 06:00" } };
    const detail = `<script type="application/ld+json">${JSON.stringify({ "@type": "Event", name: "Infinite Grooves", startDate: "2026-10-24T23:00:00+03:00", endDate: "2026-10-25T06:00:00+02:00", eventStatus: "https://schema.org/EventScheduled", url: listed.sourceUrl, location: { name: "Club Code" }, offers: { price: "10.00", priceCurrency: "EUR" } })}</script>`;
    expect(parseClubEventDetail(detail, listed).fields).toMatchObject({ place: "Club Code", price: 10, status: "EventScheduled" });
    expect(() => parseClubEventDetail(detail, { ...listed, fields: { ...listed.fields, dateText: "Sun 25 Oct, 23:00" } })).toThrow("dates disagree");
  });

  it("detects a detail cancellation even when the club listing has not changed", async () => {
    const club = candidateSources.find(source => source.id === "club-code-upcoming")!;
    const listing = `<div class="event-list"><div class="card bg-dark text-white"><div><h3>Infinite Grooves</h3>Sat 24 Oct, 23:00 → Sun 25 Oct, 06:00</div><a href="/event/?eventid=300">Детайли</a></div></div>`;
    const detail = `<script type="application/ld+json">${JSON.stringify({ "@type": "Event", name: "Infinite Grooves", startDate: "2026-10-24T23:00:00+03:00", endDate: "2026-10-25T06:00:00+02:00", eventStatus: "https://schema.org/EventCancelled", url: "https://www.clubcode.bg/event/?eventid=300", location: { name: "Club Code" } })}</script>`;
    const fetchMock = vi.fn().mockResolvedValueOnce(response(listing)).mockResolvedValueOnce(response(detail));
    vi.stubGlobal("fetch", fetchMock);
    const previous = { failures: 0, items: { "300": "scheduled-fingerprint" }, bodyHash: createHash("sha256").update(listing).digest("hex"), lastParsedAt: "2026-10-24T09:00:00Z" };
    const result = await runPilotSource(club, previous, time, true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.journal.outcome).toBe("parsed");
    expect((result.journal.changes as { changed: string[] }).changed).toEqual(["300"]);
    expect(result.snapshot?.items[0]?.fields.status).toBe("EventCancelled");
  });

  it("records a dated club event as expired instead of an unexplained removal", async () => {
    const club = candidateSources.find(source => source.id === "club-code-upcoming")!;
    const listing = `<div class="event-list"><div class="card bg-dark text-white"><div><h3>Infinite Grooves</h3>Sat 24 Oct, 23:00 → Sun 25 Oct, 06:00</div><a href="/event/?eventid=301">Детайли</a></div></div>`;
    const detailUrl = "https://www.clubcode.bg/event/?eventid=301";
    const detail = `<script type="application/ld+json">${JSON.stringify({ "@type": "Event", name: "Infinite Grooves", startDate: "2026-10-24T23:00:00+03:00", endDate: "2026-10-25T06:00:00+02:00", eventStatus: "https://schema.org/EventScheduled", url: detailUrl, location: { name: "Club Code" } })}</script>`;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(response(listing)).mockResolvedValueOnce(response(detail)));
    const result = await runPilotSource(club, { failures: 0, items: { "300": "old" }, itemEndAt: { "300": "2026-10-24T08:00:00Z" } }, time);
    expect(result.journal.outcome).toBe("parsed");
    expect(result.journal.expired).toEqual(["300"]);
    expect((result.journal.changes as { missing: string[] }).missing).toEqual([]);
    expect(result.state.itemEndAt).toEqual({ "301": "2026-10-25T06:00:00+02:00" });
  });

  it("rejects club detail links to another host", () => {
    const listing = `<div class="event-list"><div class="card bg-dark text-white"><div><h3>Infinite Grooves</h3>Sat 24 Oct, 23:00</div><a href="https://elsewhere.example/event/?eventid=300">Детайли</a></div></div>`;
    expect(() => parsePilotPage("club-code-upcoming", listing)).toThrow("left the source host");
  });

  it("keeps only explicitly named Plovdiv candidates with a matching local detail address", () => {
    const card = (id: string, title: string) => `<div id="${id}" class="event_content_box"><div class="headline_date_t_all"><span>30</span><span>октомври</span></div><div class="headline_text_t_all"><span>${title}</span></div><a href="https://epaygo.bg/${id}">Билет</a></div>`;
    const listing = parsePilotPage("epaygo-plovdiv-explicit", card("4095825818", "Live in Plovdiv") + card("3449284060", "Опера Пловдив") + card("88888888", "Live in Sofia"));
    expect(listing.items.map((entry) => entry.key)).toEqual(["4095825818", "3449284060"]);
    const detail = (name: string, address: string, startDate = "2026-10-30T20:00") => `<script type="application/ld+json">${JSON.stringify({ "@type": "Event", name, startDate, location: { name: "Rock Bar", address: { streetAddress: address } } })}</script>`;
    expect(parseEpayGoEventDetail(detail("Live in Plovdiv", "ул. Лейди Странгфорд 5, Пловдив"), listing.items[0]!)?.fields).toMatchObject({ date: "2026-10-30", time: "20:00", place: "Rock Bar" });
    expect(parseEpayGoEventDetail(detail("Опера Пловдив", "бул. Дондуков 30, София"), listing.items[1]!)).toBeNull();
    expect(parseEpayGoEventDetail("<html></html>", listing.items[0]!)).toBeNull();
    expect(() => parseEpayGoEventDetail(detail("Live in Plovdiv", "Пловдив", "2026-10-31T20:00"), listing.items[0]!)).toThrow("listing and detail dates disagree");
    expect(() => parseEpayGoEventDetail(detail("Live in Plovdiv", "Пловдив", "2026-02-31T20:00"), listing.items[0]!)).toThrow("incomplete dated event detail");
  });

  it("accepts a zero-padded list day only when the detail has the same calendar date", () => {
    const listing = `<div id="2053337461" class="event_content_box"><div class="headline_date_t_all"><span>09</span><span>декември</span></div><div class="headline_text_t_all"><span>Коледно парти Пловдив</span></div><a href="https://epaygo.bg/2053337461">Билет</a></div>`;
    const candidate = parsePilotPage("epaygo-plovdiv-explicit", listing).items[0]!;
    const detail = (startDate: string) => `<script type="application/ld+json">${JSON.stringify({ "@type": "Event", name: "Коледно парти Пловдив", startDate, location: { name: "Allure Caribe", address: { streetAddress: "бул. Санкт Петербург 131, Пловдив" } } })}</script>`;
    expect(parseEpayGoEventDetail(detail("2026-12-09T19:00"), candidate)?.fields.date).toBe("2026-12-09");
    expect(() => parseEpayGoEventDetail(detail("2026-12-10T19:00"), candidate)).toThrow("listing and detail dates disagree");
  });

  it("does not reuse an unchanged national event listing without rechecking its details", async () => {
    const source = candidateSources.find((entry) => entry.id === "epaygo-plovdiv-explicit")!;
    const listing = `<div id="4095825818" class="event_content_box"><div class="headline_date_t_all"><span>30</span><span>октомври</span></div><div class="headline_text_t_all"><span>Live in Plovdiv</span></div><a href="https://epaygo.bg/4095825818">Билет</a></div>`;
    const detail = `<script type="application/ld+json">${JSON.stringify({ "@type": "Event", name: "Live in Plovdiv", startDate: "2026-10-30T20:00", location: { name: "Rock Bar", address: { streetAddress: "Пловдив" } } })}</script>`;
    const fetchMock = vi.fn().mockResolvedValueOnce(response(listing)).mockResolvedValueOnce(response(detail)).mockResolvedValueOnce(response(listing)).mockResolvedValueOnce(response(detail));
    vi.stubGlobal("fetch", fetchMock);
    const first = await runPilotSource(source, { failures: 0, items: {} }, time);
    const second = await runPilotSource(source, first.state, time + 6 * 60 * 60_000);
    expect(first.journal.outcome).toBe("parsed");
    expect(second.journal.outcome).toBe("parsed");
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("hides the source when a previously verified event loses its detail", async () => {
    const source = candidateSources.find((entry) => entry.id === "epaygo-plovdiv-explicit")!;
    const listing = `<div id="4095825818" class="event_content_box"><div class="headline_date_t_all"><span>30</span><span>октомври</span></div><div class="headline_text_t_all"><span>Live in Plovdiv</span></div><a href="https://epaygo.bg/4095825818">Билет</a></div>`;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(response(listing)).mockResolvedValueOnce(response("<html></html>")));
    const result = await runPilotSource(source, { failures: 0, items: { "4095825818": "valid-fingerprint" } }, time);
    expect(result.journal.outcome).toBe("failed");
    expect(result.journal.error).toBe("epaygo-plovdiv-explicit: previously verified event lost its dated local detail");
    expect(result.state.items).toEqual({ "4095825818": "valid-fingerprint" });
  });

  it("extracts a shelter profile by stable photo directory without claiming adoption", () => {
    const dog = `<div class="dog-post-container"><div class="dog-image"><a href="https://register-dogs.com/shelter/uploads/plovdivd_shelter/11899/photo.jpg">Снимка</a></div><div class="dog-information"><dl><dt>Порода:</dt><dd>кръстоска</dd></dl><dl><dt>Пол:</dt><dd>женско</dd></dl><dl><dt>Размер:</dt><dd>средно</dd></dl><dl><dt>Цвят:</dt><dd>черно-бяло</dd></dl><div class="dog-description">Търси дом.</div></div></div>`;
    const snapshot = parsePilotPage("plovdiv-dog-shelter", `<div id="adoption-gallery">${dog}</div>`);
    expect(snapshot.items[0]).toMatchObject({ key: "11899", fields: { dogId: "11899", breed: "кръстоска", description: "Търси дом." } });
    expect(snapshot.completeness).toBe("uncertain");
    expect(() => parsePilotPage("plovdiv-dog-shelter", `<div id="adoption-gallery">${dog.replace("11899/photo.jpg", "photo.jpg")}</div>`)).toThrow("incomplete dog profile");
  });

  it("extracts all priced municipal transport rows and refuses an incomplete table", () => {
    const rows = Array.from({ length: 18 }, (_, index) => `<tr><td>${index + 1}</td><td>Билет ${index + 1}</td><td>1.00 лв.</td><td>0.50€</td></tr>`).join("");
    const table = `<table><thead><tr><th>Цените на превозни документи</th></tr></thead><tbody>${rows}</tbody></table>`;
    const snapshot = parsePilotPage("plovdiv-transit", table);
    expect(snapshot.items).toHaveLength(18);
    expect(snapshot.items[0]).toMatchObject({ key: "fare-1", fields: { label: "Билет 1", price: "0,50 евро" } });
    expect(() => parsePilotPage("plovdiv-transit", table.replace("0.50€", ""))).toThrow("incomplete ticket price row");
  });

  it("extracts only the published low-emission rules and rejects a changed boundary", () => {
    const html = `<div id="content"><div class="anons">
      <p>От 1 октомври 2026 г. в Пловдив започва да действа зона „Малък ринг“. Ограничението ще се прилага ежегодно в периода от 1 октомври до 30 април и ще важи за моторни превозни средства от първа и втора екологична група.</p>
      <p>Зона „Малък ринг“ обхваща територията, оградена от бул. „Руски“, бул. „Цар Борис III Обединител“, бул. „Христо Ботев“ и бул. „Шести септември“.</p>
      <p>Автомобилите, за които няма данни за екологична категория, не се считат за нарушители.</p>
      <p>Право на навлизане и движение в зоната имат при определените в наредбата условия собственици и наематели на жилищни имоти. Предвидено е изключение и за исторически моторни превозни средства.</p>
      <p>За ползване на това право е необходимо подаване на заявление. Пропускът се издава за срок до една година и се отнася за едно МПС на жилище.</p>
    </div></div>`;
    const snapshot = parsePilotPage("plovdiv-low-emission", html);
    expect(snapshot.items.map(entry => entry.key)).toEqual(["season", "boundary", "groups", "unknown-group", "resident-access"]);
    expect(snapshot.items[1]?.fields.value).toBe("Руски · Цар Борис III Обединител · Христо Ботев · Шести септември");
    expect(snapshot.completeness).toBe("uncertain");
    expect(() => parsePilotPage("plovdiv-low-emission", html.replace("бул. „Руски“", "бул. Руски"))).toThrow("required municipal rule changed");
  });

  it("accepts GTFS routes only for the currently active Sofia service day", async () => {
    const archive = zipSync({
      "feed_info.txt": strToU8("feed_start_date,feed_end_date,feed_version\n20261024,20261231,20261025\n"),
      "calendar.txt": strToU8("service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\nWEEKEND,0,0,0,0,0,1,1,20261024,20261231\n"),
      "routes.txt": strToU8("route_id,route_type,route_short_name,route_long_name\n24,3,24,Линия 24\n"),
      "trips.txt": strToU8("route_id,service_id,trip_headsign,trip_id\n24,WEEKEND,Прослав,t1\n24,WEEKEND,Устрем,t2\n"),
      "agency.txt": strToU8("agency_timezone\nEurope/Sofia\n"),
      "stops.txt": strToU8("stop_id,stop_name\ns1,QA спирка 1\ns2,QA спирка 2\n"),
      "stop_times.txt": strToU8("trip_id,stop_id,arrival_time,departure_time,stop_sequence\nt1,s1,08:00:00,08:00:00,1\nt1,s2,08:10:00,08:10:00,2\nt2,s2,08:30:00,08:30:00,1\nt2,s1,08:40:00,08:40:00,2\n"),
    });
    const sunday = Date.parse("2026-10-25T12:00:00Z");
    expect(parsePlovdivGtfsArchive(archive, sunday).items[0]?.fields).toMatchObject({ line: "24", destinations: "Прослав · Устрем", serviceDate: "2026-10-25" });
    expect(() => parsePlovdivGtfsArchive(archive, Date.parse("2026-10-26T12:00:00Z"))).toThrow("no service defined for today");
    expect(() => parsePlovdivGtfsArchive(zipSync({
      "feed_info.txt": strToU8("feed_start_date,feed_end_date,feed_version\n20261024,20261231,20261025\n"),
      "calendar.txt": strToU8("service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\nWEEKEND,0,0,0,0,0,1,1,20261024,20261231\n"),
      "calendar_dates.txt": strToU8("service_id,date,exception_type\nWEEKEND,20261025,2\n"),
      "routes.txt": strToU8("route_id,route_type,route_short_name,route_long_name\n24,3,24,Линия 24\n"),
      "trips.txt": strToU8("route_id,service_id,trip_headsign\n24,WEEKEND,Прослав\n"),
    }), sunday)).toThrow("calendar exceptions require separate validation");
    const source = candidateSources.find((entry) => entry.id === "plovdiv-livetransport-gtfs")!;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(archive, { status: 200, headers: { "content-type": "application/zip" } })));
    const result = await runPilotSource(source, { failures: 0, items: {} }, sunday);
    expect(result.journal.outcome).toBe("parsed");
    expect(result.snapshot?.items).toHaveLength(1);
  });
});
