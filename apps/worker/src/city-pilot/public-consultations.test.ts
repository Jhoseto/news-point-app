import { describe, expect, it } from "vitest";
import { collectPublicConsultations, parseConsultationDetail, parseConsultationListing } from "./public-consultations";

const now = new Date("2026-10-26T05:20:00Z");
const title = "Проект на наредба за местните услуги в Община Пловдив";
const listing = `<div id="content"><h1>Проекти на нормативни актове</h1>
  <div class="lnk"><p><strong>Дата на публикуване:</strong> 09.10.2026 г.</p><p><a href="https://strategy.bg/bg/public-consultations/12790">${title}</a></p></div>
  <div class="lnk"><p><strong>Дата на публикуване:</strong> 14.08.2026 г.</p><p><a href="/old-project/">Стар местен проект</a></p></div>
  <div class="lnk"><p><strong>Дата на публикуване:</strong> 7.05.2024 г.</p><p><a href="/archive/">Архив</a></p></div>
  <div class="lnk"><p><strong>Дата на публикуване:</strong> 02.01.2024 г.</p><p><a href="/archive-2/">Архив</a></p></div></div>`;

function detail(status = "Активна", deadline = "09.11.2026", heading = title) {
  return `<h1>${heading}</h1>
    <div><h3>Откриване / Приключване</h3><span>09.10.2026 г.</span> — <span>${deadline} г.</span><span>${status}</span></div>
    <div><h3>Номер на консултация</h3><span>12790-K</span></div>
    <div><h3>Община</h3><span>Пловдив</span></div>
    <div><h3>Вносител</h3><span>Общинска администрация - Пловдив</span></div>
    <div><h3>Контактна информация</h3><p>Електронна поща: info@plovdiv.bg</p></div>
    <div><h3>Начини на предоставяне на предложения и становища</h3><ul><li>Портал</li><li>Електронна поща</li><li>Сигурно връчване</li><li>Кореспонденция</li></ul></div>`;
}

describe("Plovdiv public consultation pilot", () => {
  it("matches the municipal project to the active state consultation and keeps its published deadline", async () => {
    const entries = parseConsultationListing(listing, now);
    expect(entries).toHaveLength(1);
    const snapshot = await collectPublicConsultations(listing, async () => detail(), now);
    expect(snapshot.items.map(item => item.key)).toEqual(["12790"]);
    expect(snapshot.items[0]?.fields).toMatchObject({ opened: "2026-10-09", deadline: "2026-11-09", email: "info@plovdiv.bg" });
    const edited = parseConsultationDetail(detail("Активна", "10.11.2026"), entries[0]!, now);
    expect(edited?.fingerprint).not.toBe(snapshot.items[0]?.fingerprint);
  });

  it("hides an expired consultation and refuses conflicting status, title or municipality", () => {
    const entry = parseConsultationListing(listing, now)[0]!;
    expect(parseConsultationDetail(detail("Активна", "25.10.2026"), entry, now)).toBeNull();
    expect(() => parseConsultationDetail(detail("Приключила"), entry, now)).toThrow(/not marked active/u);
    expect(() => parseConsultationDetail(detail("Активна", "09.11.2026", "Друг проект"), entry, now)).toThrow(/title does not match/u);
    expect(() => parseConsultationDetail(detail().replace("<span>Пловдив</span>", "<span>Варна</span>"), entry, now)).toThrow(/not municipal Plovdiv/u);
  });

  it("rejects a missing submission contact rather than publishing incomplete instructions", () => {
    const entry = parseConsultationListing(listing, now)[0]!;
    expect(() => parseConsultationDetail(detail().replace("info@plovdiv.bg", ""), entry, now)).toThrow(/submission contacts changed/u);
  });
});
