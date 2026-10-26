import { describe, expect, it, vi } from "vitest";
import { balbokCampaignLinks, collectBalbokCampaigns, parseBalbokCampaign } from "./balbok-campaigns";
const url = "https://www.balbok.com/bg/news/plovdiv-campaign";
// Explicit controlled examples modelled on the inspected markup, never live evidence.
const listing = '<ul id="news"><li><a href="/bg/news/plovdiv-campaign">Кампании в Пловдив</a><a href="/bg/news/plovdiv-campaign">Кампании в Пловдив</a></li><li><a href="/bg/news/other">Кампания в Сливен</a></li></ul>';
const article = (date = "3 ноември", time = "08:30-14:30", note = "") => `<div id="left"><h3>Кампании в община Пловдив</h3><p class="datearticle">2026-10-15</p>
<p>Община Сливен, 2 ноември от 10:00-16:00 часа</p><p>Мобилният пункт е в гр. Сливен, ул. Друга.</p>
<p>Община Пловдив, ${date} от ${time} часа</p><p>Мобилният пункт е в гр. Пловдив, бул. Тестов, паркинг.</p><p>${note}</p>
<ul><li>Лакове и бояджийски материали</li><li>Лекарства с изтекъл срок</li></ul></div>`;
describe("operator hazardous waste campaigns", () => {
  it("discovers only Plovdiv announcements and deduplicates their repeated links", () => {
    expect(balbokCampaignLinks(listing)).toEqual([url]);
    expect(() => balbokCampaignLinks(listing.replaceAll("/bg/news/plovdiv-campaign", "https://elsewhere.example/bg/news/a"))).toThrow();
    expect(() => balbokCampaignLinks('<div>Няма нищо</div>')).toThrow();
  });
  it("keeps the city-specific place/time and extracts accepted waste, not another city's address", () => {
    const result = parseBalbokCampaign(article(), url);
    expect(result).toHaveLength(1);
    expect(result[0]!.fields).toMatchObject({ date: "2026-11-03", startTime: "08:30", endTime: "14:30", address: "Мобилният пункт е в гр. Пловдив, бул. Тестов, паркинг.", accepted: "Лакове и бояджийски материали; Лекарства с изтекъл срок" });
  });
  it("keeps identity on a corrected date and distinguishes explicit cancellation from conditional text", () => {
    const first = parseBalbokCampaign(article(), url)[0]!, corrected = parseBalbokCampaign(article("4 ноември"), url)[0]!;
    expect(corrected.key).toBe(first.key); expect(corrected.fingerprint).not.toBe(first.fingerprint);
    expect(parseBalbokCampaign(article("3 ноември", "08:30-14:30", "Кампанията е отменена."), url)[0]!.fields.status).toBe("cancelled");
    expect(parseBalbokCampaign(article("3 ноември", "08:30-14:30", "Ако кампанията е отменена, ще бъдете уведомени."), url)[0]!.fields.status).toBe("scheduled");
  });
  it("drops a campaign at its actual Sofia end time, even before the next daily refresh", async () => {
    expect((await collectBalbokCampaigns(listing, async () => article(), new Date("2026-11-03T12:29:00Z"))).items).toHaveLength(1);
    expect((await collectBalbokCampaigns(listing, async () => article(), new Date("2026-11-03T12:30:00Z"))).items).toHaveLength(0);
  });
  it("rejects bad dates, reversed hours, missing locations and ambiguous rollover years", () => {
    for (const html of [article("31 ноември"), article("3 ноември", "14:30-08:30"), article().replace("гр. Пловдив, бул. Тестов", "гр. Друг, бул. Тестов"), article("3 януари"), article().replace(/<ul>.*<\/ul>/u, "")])
      expect(() => parseBalbokCampaign(html, url)).toThrow();
  });
  it("fails the collection on a temporary detail outage instead of declaring an empty successful calendar", async () => {
    const read = vi.fn().mockRejectedValue(new Error("HTTP 503"));
    await expect(collectBalbokCampaigns(listing, read)).rejects.toThrow("HTTP 503");
    expect(read).toHaveBeenCalledTimes(1);
    const empty = await collectBalbokCampaigns('<ul id="news"><li><a href="/bg/news/other">Сливен</a></li></ul>', read);
    expect(empty.items).toHaveLength(0); expect(empty.completeness).toBe("uncertain");
  });
});
