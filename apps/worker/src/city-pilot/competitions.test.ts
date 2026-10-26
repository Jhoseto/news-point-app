import { describe, expect, it } from "vitest";
import { collectManagementCompetitions, parseCompetitionListing, parseCompetitionNoticeText } from "./competitions";

const now = new Date("2026-10-26T06:00:00Z");
const title = "Обява за конкурс за възлагане управлението на “ЕКОБУС ПЛОВДИВ” ЕООД";
const card = (name = title) => `<div class="anons"><p><strong>Дата на публикуване:</strong> 02.10.2026 г.</p><p><a href="/wp-content/uploads/2026/10/ObyavaKonkursUpravitelEkobus.pdf">${name}</a></p></div>`;
const page = (name = title) => `<div id="content"><h1>Конкурси</h1>${card(name)}</div>`;
const pdf = (deadline = "02.11.2026", company = "ЕКОБУС ПЛОВДИВ") => `ОБЩИНА ПЛОВДИВ. Конкурс за възлагане управлението на “${company}” ЕООД. Документите за участие в конкурса се подават лично в „Деловодство“ на община Пловдив, пл. „Ст. Стамболов” № 1. Срок за подаване на документи: до 17.00 часа на ${deadline} г.`;

describe("municipal management competition pilot", () => {
  it("keeps attached blank forms associated with their own notice and rejects external attachments", () => {
    const withForm = page().replace("</div></div>", '<p><a href="/wp-content/uploads/2026/10/forms.pdf">Заявление и декларация</a></p></div></div>');
    expect(parseCompetitionListing(withForm, now)[0]?.attachments).toEqual([{ title: "Заявление и декларация", url: "https://www.plovdiv.bg/wp-content/uploads/2026/10/forms.pdf" }]);
    expect(() => parseCompetitionListing(withForm.replace('/wp-content/uploads/2026/10/forms.pdf', 'https://example.com/forms.pdf'), now)).toThrow("unsupported");
  });
  it("reads only a recent management competition PDF and versions a deadline edit", async () => {
    expect(parseCompetitionListing(page(), now)).toHaveLength(1);
    const first = await collectManagementCompetitions(page(), async () => pdf(), now);
    const changed = await collectManagementCompetitions(page(), async () => pdf("03.11.2026"), now);
    expect(first.items[0]?.fields).toMatchObject({ company: "ЕКОБУС ПЛОВДИВ", deadline: "2026-11-02", time: "17:00" });
    expect(changed.items[0]?.key).toBe(first.items[0]?.key);
    expect(changed.items[0]?.fingerprint).not.toBe(first.items[0]?.fingerprint);
    expect(parseCompetitionListing(page("Обява за конкурс за отдаване под наем на общински имот"), now)).toEqual([]);
  });

  it("hides an expired application and rejects mismatched company or missing exact deadline", () => {
    const link = parseCompetitionListing(page(), now)[0]!;
    expect(parseCompetitionNoticeText(pdf(), link, new Date("2026-11-03T06:00:00Z"))).toBeNull();
    expect(() => parseCompetitionNoticeText(pdf("02.11.2026", "ДРУГО ДРУЖЕСТВО"), link, now)).toThrow("differs");
    expect(() => parseCompetitionNoticeText(pdf().replace("Срок за подаване на документи:", "Срок: "), link, now)).toThrow("deadline missing");
    expect(() => parseCompetitionNoticeText(pdf().replace("Стамболов", "друг адрес"), link, now)).toThrow("submission place inconsistent");
  });
});
