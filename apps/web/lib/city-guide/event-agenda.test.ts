import { describe, expect, it } from "vitest";
import { cityAgenda, agendaPeriodMatches, agendaExtraMatches, eventDescription, type AgendaEvent } from "./event-agenda";
import { cityAgendaStories } from "./news";
import type { CityObservation } from "./local-observations";
import type { ArticleSummary } from "../queries";
const group = (sourceId: string, fields: Record<string, string | number>): CityObservation => ({ sourceId, checkedAt: "2026-10-26T06:00:00Z", status: "observed", completeness: "uncertain", items: [{ key: "event", fields }] });
describe("unified event agenda", () => {
  it("uses only explicit title or published zero-price evidence for interests", () => {
    expect(agendaExtraMatches({ title: "DJ Night", price: null }, "electronic")).toBe(true);
    expect(agendaExtraMatches({ title: "Студентски празник", price: null }, "student")).toBe(true);
    expect(agendaExtraMatches({ title: "Concert", price: 0 }, "free")).toBe(true);
    expect(agendaExtraMatches({ title: "Concert", price: null }, "free")).toBe(false);
    expect(agendaExtraMatches({ title: "Live at Rock Bar Download", price: null }, "rock")).toBe(false);
    expect(agendaExtraMatches({ title: "Фики", price: null }, "folk")).toBe(false);
    expect(agendaExtraMatches({ title: "Unknown", price: null }, "unknown")).toBe(false);
  });
  it("uses verified venue programme types, recurrence and separate doors/show times", () => {
    const programme = group("bilet-beebop", { title: "Verified programme fixture", eventKind: "live", date: "2026-11-22", time: "20:00", doorsTime: "20:00", performanceTime: "21:00", description: "Programme detail", imageHash: "b".repeat(64) });
    expect(cityAgenda([programme], "culture")).toEqual([]);
    expect(cityAgenda([programme], "nightlife")[0]).toMatchObject({ kind: "live", doorsTime: "20:00", performanceTime: "21:00", description: "Programme detail" });
    expect(cityAgenda([{ ...programme, sourceId: "unverified" }], "nightlife")).toEqual([]);
    const weekly = group("plovdiv-live-club-events", { title: "Weekly fixture", eventKind: "live", date: "2026-10-29", time: "", recurrence: "Всеки четвъртък" });
    expect(cityAgenda([weekly], "nightlife")[0]).toMatchObject({ recurrence: "Всеки четвъртък", time: "" });
  });
  it("adds official practical details without duplicating description paragraphs", () => {
    expect(eventDescription({ description: "Първи абзац.\n\nВтори абзац.\n\nПърви абзац.", duration: "160 минути", language: "Италиански", subtitles: "Български" }))
      .toBe("Първи абзац.\n\nВтори абзац.\n\nВреметраене: 160 минути · Език: Италиански · Субтитри: Български");
  });
  it("routes explicit live music exclusively to nightlife and preserves theatre times", () => {
    const live = group("epaygo-plovdiv-explicit", { title: "Live at Download", date: "2026-10-30", time: "20:00", place: "Download" });
    expect(cityAgenda([live], "culture")).toEqual([]);
    expect(cityAgenda([live], "nightlife")[0]?.kind).toBe("live");
    const theatre = cityAgenda([group("plovdiv-theatre", { title: "Одисей", dateTime: "26-10-2026 г. 19:00 ч." })], "culture", "2026-10-26")[0];
    expect(theatre).toMatchObject({ date: "2026-10-26", endDate: "2026-10-26", time: "19:00", image: null });
  });
  it("keeps explicit cancellation and only uses internally archived images", () => {
    const event = cityAgenda([group("club-code-upcoming", { title: "Party", startDate: "2026-10-31T23:00:00+02:00", endDate: "2026-11-01T06:00:00+02:00", status: "EventCancelled", imageUrl: "https://external/image.jpg", imageHash: "a".repeat(64) })], "nightlife")[0]!;
    expect(event.status).toBe("EventCancelled");
    expect(event.image).toMatch(/^\/moyat-plovdiv\/event-image\/\?/u);
    expect(agendaPeriodMatches(event, "today", "2026-11-01")).toBe(true);
  });
  it("includes an ongoing exhibition and uses seven calendar days, not eight", () => {
    const event = { date: "2026-10-01", endDate: "2026-10-28" } as AgendaEvent;
    expect(agendaPeriodMatches(event, "today", "2026-10-26")).toBe(true);
    expect(agendaPeriodMatches({ ...event, date: "2026-11-02", endDate: "2026-11-02" }, "week", "2026-10-26")).toBe(false);
  });
  it("removes finished events before they reach any agenda filter", () => {
    const expired = group("plovdiv-theatre", { title: "Минало представление", dateTime: "25-10-2026 г. 19:00 ч." });
    const current = group("plovdiv-theatre", { title: "Предстоящо представление", dateTime: "30-10-2026 г. 19:00 ч." });
    expect(cityAgenda([expired, current], "culture", "2026-10-29").map(event => event.title)).toEqual(["Предстоящо представление"]);
  });
  it("chooses recent local context, never parties, crimes or stale event announcements", () => {
    const now = new Date("2026-10-26T10:00:00Z");
    const article = (title: string, date = "2026-10-25", id = title): ArticleSummary => ({ id, title, path: `/news/${id}`, excerpt: "Пловдив", publishedAt: new Date(date), category: null, hero: null, authorName: "NewsPoint" });
    const pool = [article("Партиите се разбраха в Пловдив"), article("Парти за деца в Пловдив"), article("Концерт утре", "2026-10-01"), article("Moby закри фестивала в Пловдив", "2026-07-20"), article("Нов концерт в Пловдив"), article("Нов концерт в Пловдив", "2026-10-24", "duplicate"), article("Концерт в Пловдив", "2026-10-28")];
    expect(cityAgendaStories(pool, ["party"], now)).toEqual([]);
    expect(cityAgendaStories(pool, ["live"], now).map(story => story.title)).toEqual(["Нов концерт в Пловдив"]);
    expect(cityAgendaStories([article("Moby закри фестивала с концерт в Пловдив", "2026-07-20")], ["live"], now)).toEqual([]);
    expect(cityAgendaStories([article("Обжалване блокира ул. Младежка в Пловдив"), article("Младежка агресия след мача в Пловдив"), article("Предприемачи след убийството в Пловдив"), article("Мис България на Античния театър в Пловдив")], ["community", "theatre"], now)).toEqual([]);
    expect(cityAgendaStories([article("Стрелец с арбалет в Пловдив"), article("Голов спектакъл на стадиона в Пловдив")], ["opera", "theatre"], now)).toEqual([]);
  });
});
