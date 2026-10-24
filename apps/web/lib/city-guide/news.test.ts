import { describe, expect, it } from "vitest";
import type { ArticleSummary } from "../queries";
import { CITY_CATEGORIES, OUT_TOPICS } from "./catalog";
import { cityNewsUrl, cityOutStories, cityStoriesForTopics, cityStoryForCategory, cityStoryForTopic } from "./news";

const article = (id: string, title: string): ArticleSummary => ({
  id, path: `/news/${id}/`, title, excerpt: "", authorName: "NewsPoint.bg",
  publishedAt: new Date("2026-10-24T10:00:00Z"), category: null, hero: null,
});

describe("city guide news links", () => {
  it("links a topic to a published headline with a specific subject signal", () => {
    const result = cityStoryForTopic("Синя и зелена зона", [
      article("unrelated", "Нови светлини в Пловдив"),
      article("parking", "Променят правилата за синя зона в Пловдив"),
    ]);
    expect(result?.path).toBe("/news/parking/");
  });

  it("never fills an unrelated topic with a generic city headline", () => {
    const result = cityStoriesForTopics(["Без вода", "Първи клас"], [article("city", "Пловдив посреща гости")]);
    expect(result).toEqual({ "Без вода": null, "Първи клас": null });
  });

  it("does not confuse incidents near transport with timetable and live-bus information", () => {
    const articles = [
      article("fire", "Автобус се запали в Коматево, движението е затруднено"),
      article("airport-fire", "Пожар край Летище Пловдив"),
      article("bus-route", "Нова автобусна линия и разписание за Пловдив"),
    ];
    expect(cityStoryForTopic("Градски автобуси", articles)?.path).toBe("/news/bus-route/");
    expect(cityStoryForTopic("Къде е автобусът?", articles)).toBeNull();
    expect(cityStoryForTopic("Извън града", articles)).toBeNull();
  });

  it("does not mistake green park space for a paid green parking zone", () => {
    expect(cityStoryForTopic("Синя и зелена зона", [article("park", "Нов парк ще се превърне в зелена зона")])).toBeNull();
    expect(cityStoryForTopic("Паркинги", [article("match", "Булевардът става паркинг за футболен мач")])).toBeNull();
    expect(cityStoryForTopic("Паркинги", [article("bollards", "Обновяват антипаркинг стълбчета в Пловдив")])).toBeNull();
    expect(cityStoryForTopic("Паркинги", [article("new", "Откриват нов общински паркинг в Пловдив")])?.path).toBe("/news/new/");
  });

  it("keeps rescue operations and football clubs out of the OUT cultural stories", () => {
    const stories = cityOutStories([
      article("club", "Футболният клуб събира средства от фенове"),
      article("rescue", "Разиграха спасителна операция в центъра"),
      article("music", "Музикален фестивал с концерт в Пловдив"),
    ]);
    expect(stories.map(story => story.path)).toEqual(["/news/music/"]);
    expect(cityStoryForTopic("Опера и балет", [article("rescue", "Спасителна операция в Пловдив")])).toBeNull();
  });

  it("does not resurface an expired 'today' headline as current news", () => {
    const oldToday = { ...article("water", "Части на Пловдив са без вода днес"), publishedAt: new Date("2026-09-28T07:35:10Z") };
    const now = new Date("2026-10-24T10:00:00Z");
    expect(cityStoryForTopic("Без вода", [oldToday], now)).toBeNull();
    expect(cityOutStories([{ ...oldToday, title: "Винен фестивал днес в Пловдив" }], 3, now)).toEqual([]);
  });

  it("keeps incidental locations and general school stories out of practical topics", () => {
    expect(cityStoryForTopic("Пазарите на Пловдив", [article("geyser", "Воден гейзер край Понеделник пазара в Пловдив")])).toBeNull();
    expect(cityStoryForTopic("Пазарите на Пловдив", [article("hours", "Ново работно време на общинските пазари")])?.path).toBe("/news/hours/");
    expect(cityStoryForTopic("Детски градини и ясли", [article("renovation", "Модернизират детска градина Родина")])).toBeNull();
    expect(cityStoryForTopic("Детски градини и ясли", [article("admission", "Обявиха свободните места за прием в детските градини")])?.path).toBe("/news/admission/");
    expect(cityStoryForTopic("Училища и градини", [article("games", "58 училища участват в Ученическите игри")])).toBeNull();
    expect(cityStoryForTopic("Училища и градини", [article("fire", "Автомобил пламна до училище в Пловдив и стресна района")])).toBeNull();
    expect(cityStoryForTopic("Училища и градини", [article("new-school", "Откриват ново училище в Пловдив")])?.path).toBe("/news/new-school/");
  });

  it("does not present past dated notices or old event coverage as a current lead", () => {
    const now = new Date("2026-10-24T10:00:00Z");
    expect(cityStoryForTopic("Мобилни пунктове", [article("expired", "Събират опасни отпадъци на 22 октомври")], now)).toBeNull();
    expect(cityStoryForTopic("Къде да изхвърля?", [article("expired", "Събират опасни отпадъци на 22 октомври")], now)).toBeNull();
    expect(cityStoryForTopic("Мобилни пунктове", [article("upcoming", "Мобилен пункт за опасни отпадъци на 29 октомври")], now)?.path).toBe("/news/upcoming/");
    const oldConcert = { ...article("concert", "Концерт на Моби в Пловдив"), publishedAt: new Date("2026-07-12T10:00:00Z") };
    expect(cityStoryForTopic("Концерти", [oldConcert], now)).toBeNull();
    expect(cityOutStories([oldConcert], 3, now)).toEqual([]);
  });

  it("reselects a newer, more specific article regardless of input order", () => {
    const older = { ...article("older", "Промени в платено паркиране"), publishedAt: new Date("2026-10-20T10:00:00Z") };
    const newer = { ...article("newer", "Синя зона в Пловдив с нови правила"), publishedAt: new Date("2026-10-24T09:00:00Z") };
    const now = new Date("2026-10-24T10:00:00Z");
    expect(cityStoryForTopic("Синя и зелена зона", [older], now)?.path).toBe("/news/older/");
    expect(cityStoryForTopic("Синя и зелена зона", [older, newer], now)?.path).toBe("/news/newer/");
    expect(cityStoryForCategory(["Синя и зелена зона", "Паркинги"], [older, newer], now)?.path).toBe("/news/newer/");
  });

  it("keeps Night Plovdiv in the same category catalog", () => {
    const night = CITY_CATEGORIES.find(category => category.slug === "nightlife");
    expect(night?.title).toBe("Нощен Пловдив");
    expect(night?.topics.map(topic => topic.title)).toEqual([...OUT_TOPICS]);
  });

  it("gives every category and OUT item a NewsPoint search route even without a direct match", () => {
    const topics = [...CITY_CATEGORIES.flatMap(category => category.topics.map(topic => topic.title)), ...OUT_TOPICS];
    expect(topics.every(topic => cityNewsUrl(topic).startsWith("/search/?q="))).toBe(true);
    expect(cityNewsUrl("Без вода")).toContain(encodeURIComponent("без вода"));
  });
});
