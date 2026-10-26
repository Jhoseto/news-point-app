import { describe, expect, it } from "vitest";
import { collectVenueProgramme, liveClubProgramme, venueDetail, venueListing } from "./venue-programmes";
import { eventImageUrl } from "./event-media";

// Deliberate controlled fixtures, never ingested as programme data.
const url = "https://bilet.bg/bg/events/fixture-123";
const entry = { url, date: "2026-11-22" };
const event = { "@type": "Event", url, name: "Fixture concert", startDate: "2026-11-22T20:00", eventStatus: "https://schema.org/EventScheduled", image: ["https://panel.bilet.bg/media/events/fixture.png"], location: { name: "Bee Bop Café", address: { addressLocality: "Plovdiv", streetAddress: "Fixture address" } } };
const detail = (change = {}, description = "Врати: 20:00 · Начало: 21:00") => `<script type="application/ld+json">${JSON.stringify({ ...event, ...change })}</script><section><h3>За събитието</h3><div class="rich-text"><p>${description}</p></div></section>`;
const listing = (date = "22 ноември 2026") => `<article><a href="/bg/events/fixture-123">Fixture</a><span>${date}</span></article>`;

describe("venue programmes", () => {
  it("reads the id24 venue format without losing entity decoding or crossing venue identity", () => {
    const listingHtml = '<article><a href="/spravochnik/events/123.html">Контролен афиш</a><span>22.11.2026 20:00</span></article>';
    const listed = venueListing("goliamata-maritsa-programme", listingHtml)[0]!;
    expect(listed).toEqual({ url: "https://www.plovdiv24.bg/spravochnik/events/123.html", date: "2026-11-22" });
    const data = { ...event, url: listed.url, name: "А &amp; Б", description: "Сръбски хитове и купон.", location: { ...event.location, name: "Клуб Ресторант Голямата Марица" } };
    const html = `<script type="application/ld+json">${JSON.stringify({ "@graph": [data] })}</script><div class="event-details"><span class="brief"><a>Клуб Ресторант Голямата Марица</a></span><span class="brief">22.11.2026г.</span><span class="brief">20:00 ч.</span></div>`;
    expect(venueDetail("goliamata-maritsa-programme", html, listed)?.fields).toMatchObject({ title: "А & Б", eventKind: "party" });
    expect(() => venueDetail("bushido-programme", html, listed)).toThrow(/venue/u);
    const placeholder = html.replace("2026-11-22T20:00", "1970-01-01T02:00:00+02:00");
    expect(venueDetail("goliamata-maritsa-programme", placeholder, listed)?.fields).toMatchObject({ date: "2026-11-22", time: "20:00", scheduleOrigin: "visible-details" });
    for (const invalid of [placeholder.replace("22.11.2026г.", "23.11.2026г."), placeholder.replace("20:00 ч.", "Очаквайте"), html.replace("2026-11-22T20:00", "2026-11-23T20:00"), html.replace("2026-11-22T20:00", "2026-11-22T20:00+03:00")]) expect(() => venueDetail("goliamata-maritsa-programme", invalid, listed)).toThrow();
  });
  it("preserves nested programme paragraphs and only extracts an explicit fixed euro admission", () => {
    const render = (price: string) => detail({ name: "Литературно-музикална вечер", location: { ...event.location, name: "Пиано бар Синатра Пловдив" } }, `</p><div><h2>Музика на живо</h2><p>Пловдивска програма.</p><div>💶 Вход ${price}</div><p>Условия за местата.</p></div><p>`);
    const fields = venueDetail("bilet-sinatra", render("20 €"), entry)!.fields;
    expect(fields.price).toBe(20); expect(fields.eventKind).toBe("live");
    expect(fields.description).toContain("Пловдивска програма.\n\n💶 Вход 20 €\n\nУсловия за местата.");
    expect(venueDetail("bilet-sinatra", render("0 €"), entry)!.fields.price).toBe(0);
    for (const price of ["от 20 €", "20–30 €", "20 лв.", "20 € за маса", "20 €</div><div>Вход 30 €"]) expect(venueDetail("bilet-sinatra", render(price), entry)!.fields.price).toBeUndefined();
  });
  it("links a dated venue card to its exact detail and keeps doors separate from show time", () => {
    expect(venueListing("bilet-beebop", listing())).toEqual([entry]);
    expect(venueDetail("bilet-beebop", detail(), entry)?.fields).toMatchObject({ date: "2026-11-22", time: "20:00", doorsTime: "20:00", performanceTime: "21:00", eventKind: "live" });
  });
  it("rejects wrong city, wrong venue, broken dates and an unrelated canonical event", () => {
    for (const change of [
      { location: { ...event.location, address: { ...event.location.address, addressLocality: "Sofia" } } },
      { location: { ...event.location, name: "Different venue" } },
      { startDate: "2026-02-30T20:00" }, { startDate: "2026-11-23T20:00" },
      { url: url.replace("123", "456") }, { eventStatus: "Unknown" },
    ]) expect(() => venueDetail("bilet-beebop", detail(change), entry)).toThrow();
  });
  it("tracks edits and explicit cancellation without turning a failed detail into disappearance", async () => {
    const original = venueDetail("bilet-beebop", detail(), entry)!;
    const cancelled = venueDetail("bilet-beebop", detail({ eventStatus: "https://schema.org/EventCancelled" }), entry)!;
    expect(cancelled.key).toBe(original.key);
    expect(cancelled.fingerprint).not.toBe(original.fingerprint);
    expect(cancelled.fields.status).toBe("EventCancelled");
    expect(venueDetail("bilet-beebop", detail({}, "Врати: 19:00"), entry)?.fingerprint).not.toBe(original.fingerprint);
    await expect(collectVenueProgramme("bilet-beebop", listing(), async () => { throw new Error("HTTP 429"); }, new Date("2026-10-26"))).rejects.toThrow("429");
    expect(() => venueListing("bilet-beebop", "<main>Temporarily unavailable</main>")).toThrow();
    expect(() => venueListing("bilet-beebop", listing("31 ноември 2026"))).toThrow();
  });
  it("does not classify a venue description as a concert, or rock playlists as a live band", () => {
    const generic = detail({ name: "Business meeting" }, "Бизнес среща.") + '<section><div class="rich-text">Залата предлага концерти.</div></section>';
    expect(venueDetail("bilet-beebop", generic, entry)).toBeNull();
    expect(venueDetail("bilet-beebop", detail({ name: "Business meeting" }, "Получете купон за отстъпка."), entry)).toBeNull();
    expect(venueDetail("bilet-beebop", detail({ name: "EMO/ROCK party" }, "Парти със стикери на групите и DJ."), entry)?.fields.eventKind).toBe("party");
    const tour = detail({}, "Концерт в Пловдив.</p><p>Шоуто в София е различно.</p><p>Вратите отварят в 19:00");
    const local = venueDetail("bilet-beebop", tour, entry)!;
    expect(local.fields.description).not.toContain("София");
    expect(local.fields.doorsTime).toBe("19:00");
  });
  it("retains weekly programme wording without inventing a time or individually confirmed dates", () => {
    const html = '<article class="event-card" id="weekly"><div class="event-meta">Всеки четвъртък</div><h3>Fixture weekly</h3><p>Fixture band на живо.</p></article>';
    expect(liveClubProgramme(html, new Date("2026-10-26"))[0]?.fields).toMatchObject({ recurrence: "Всеки четвъртък", date: "2026-10-29", time: "" });
    expect(liveClubProgramme(html, new Date("2026-10-30"))[0]?.fields.date).toBe("2026-11-05");
    expect(() => liveClubProgramme(html.replace("Всеки четвъртък", "Неуточнен ден"))).toThrow();
  });
  it("accepts only event image paths, never ticket logos or arbitrary publisher URLs", () => {
    expect(eventImageUrl("https://panel.bilet.bg/media/events/test.png", url)).toBeTruthy();
    expect(eventImageUrl("https://i.id24.bg/im/ev/1b.jpg", url)).toBeTruthy();
    expect(eventImageUrl("https://liveclubplovdiv.com/images/poster.webp", url)).toBeTruthy();
    expect(eventImageUrl("https://bilet.bg/assets/images/bilet-bg-logo.png", url)).toBeNull();
    expect(eventImageUrl("https://panel.bilet.bg/media/upload/venue.png", url)).toBeNull();
  });
});
