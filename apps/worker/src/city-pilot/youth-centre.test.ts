import { describe, expect, it } from "vitest";
import { collectYouthCentreEvents, parseYouthDetail, parseYouthListing } from "./youth-centre";

const entry = (title: string, published: string, slug: string) => `<div class="subpage-description"><h2><a href="/bg/novini/${slug}">${title}</a></h2><span class="date">${published}</span></div>`;
const page = (...entries: string[]) => `<h2>Предстоящи събития</h2>${entries.join("")}`;
const listing = { title: "Работилница", published: "2026-10-25", detailUrl: "https://youthcentre.plovdiv.bg/bg/novini/rabotilnitsa" };
const detail = (body: string, title = "Работилница") => `<div class="vert-pics"><h2>${title}</h2><div>${body}</div></div>`;
const workshop = (date = "26 октомври") => detail(`<p>На ${date} от 18:00 ч. те каним в Младежки център Пловдив, зала „Библиотека“.</p><p>Участието е безплатно и програмата включва практическа работа.</p>`);
const now = new Date("2026-10-26T06:00:00Z");

describe("Youth Center event pilot", () => {
  it("does not confuse the article publication date with the event date", () => {
    expect(parseYouthListing(page(entry("Работилница", "25-10-2026", "rabotilnitsa")), now)).toEqual([listing]);
    expect(parseYouthDetail(workshop(), listing)?.fields).toMatchObject({ date: "2026-10-26", time: "18:00", place: "Младежки център Пловдив · зала „Библиотека“", description: expect.stringContaining("практическа работа") });
    expect(parseYouthDetail(detail("Публикувана новина от Младежки център Пловдив"), listing)).toBeNull();
  });

  it("reads an explicit multi-day range without inventing a start time", () => {
    const forum = { ...listing, title: "Младежки форум", published: "2026-10-15" };
    const parsed = parseYouthDetail(detail("📍Къде? ОП „Младежки център Пловдив“ 📅 Кога? 06-08.11.2026г.", forum.title), forum);
    expect(parsed?.fields).toMatchObject({ date: "2026-11-06", endDate: "2026-11-08", time: "" });
    expect(parseYouthDetail(detail("Кога? 08-06.11.2026 Младежки център Пловдив", forum.title), forum)).toBeNull();
    const nextYear = { ...listing, published: "2026-12-30" };
    expect(parseYouthDetail(detail("На 2 януари от 18:00 ч. в Младежки център Пловдив"), nextYear)?.fields.date).toBe("2027-01-02");
  });

  it("filters past events and versions a corrected date", async () => {
    const html = page(entry("Работилница", "25-10-2026", "rabotilnitsa"));
    const first = await collectYouthCentreEvents(html, async () => workshop(), now);
    const revised = await collectYouthCentreEvents(html, async () => workshop("27 октомври"), now);
    expect(first.items).toHaveLength(1);
    expect(first.items[0]?.key).toBe(revised.items[0]?.key);
    expect(first.items[0]?.fingerprint).not.toBe(revised.items[0]?.fingerprint);
    expect((await collectYouthCentreEvents(html, async () => workshop(), new Date("2026-10-27T06:00:00Z"))).items).toEqual([]);
  });

  it("rejects duplicate or foreign links and omits an unverified detail", async () => {
    expect(() => parseYouthListing(page(entry("Работилница", "25-10-2026", "rabotilnitsa"), entry("Работилница", "25-10-2026", "rabotilnitsa")), now)).toThrow("duplicate detail URL");
    expect(() => parseYouthListing(page('<div class="subpage-description"><h2><a href="https://other.example/event">Работилница</a></h2><span class="date">25-10-2026</span></div>'), now)).toThrow("unsupported detail URL");
    const html = page(entry("Работилница", "25-10-2026", "rabotilnitsa"), entry("Стара покана", "15-10-2026", "old"));
    const result = await collectYouthCentreEvents(html, async url => url.endsWith("/old") ? null : workshop(), now);
    expect(result.items).toHaveLength(1);
    expect(result.limitations[1]).toContain("1 recent");
    await expect(collectYouthCentreEvents(html, async () => null, now)).rejects.toThrow("no recent detail");
    await expect(collectYouthCentreEvents(html, async () => null, now, new Set([result.items[0]!.key]))).rejects.toThrow("previously verified detail");
  });
});
