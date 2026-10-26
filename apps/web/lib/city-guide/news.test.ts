import { describe, expect, it } from "vitest";
import type { ArticleSummary } from "../queries";
import { CITY_CATEGORIES, OUT_TOPICS } from "./catalog";
import { cityNewsUrl, cityOutStories, cityStoriesForTopics, cityStoryForCategory, cityStoryForEventTitle, cityStoryForTopic, cityStoryForTransitLine, cityTopicStories, cityAgendaContextStories, cityTransitLineStories, cityRecordStories } from "./news";

const article = (id: string, title: string): ArticleSummary => ({
  id, path: `/news/${id}/`, title, excerpt: "", authorName: "NewsPoint.bg",
  publishedAt: new Date("2026-10-24T10:00:00Z"), category: null, hero: null,
});

describe("city guide news links", () => {
  it("always prefers the newest eligible topic story even when an older headline repeats more query words", () => {
    const now = new Date("2026-10-26T10:00:00Z");
    const older = { ...article("old", "Билети, карти и тарифи за градски транспорт с автобуси в Пловдив"), publishedAt: new Date("2026-10-25T10:00:00Z") };
    const newer = { ...article("new", "Нова цена на билетите за автобус в Пловдив"), publishedAt: new Date("2026-10-26T09:00:00Z") };
    expect(cityTopicStories(["Билети и карти"], [older, newer], now).map(story => story.path)).toEqual(["/news/new/", "/news/old/"]);
    expect(cityStoryForTopic("Билети и карти", [older, newer], now)?.path).toBe("/news/new/");
  });
  it("follows the exact bus line and the named procedure without unrelated fallback", () => {
    const now = new Date("2026-10-26T10:00:00Z");
    const pool = [article("20", "Автобусна линия №20 в Пловдив с нов маршрут"), article("200", "Автобусна линия 200 в Пловдив с нов маршрут"), article("clinic", "Община Пловдив търси управител за Психодиспансера"), article("other", "Община Пловдив обяви конкурс за управител на друго дружество")];
    expect(cityTransitLineStories("20", pool, now).map(story => story.path)).toEqual(["/news/20/"]);
    expect(cityTransitLineStories("24", pool, now)).toEqual([]);
    expect(cityRecordStories("Работа в общината", "Психодиспансер", pool, now).map(story => story.path)).toEqual(["/news/clinic/"]);
    expect(cityRecordStories("Работа в общината", "Център за психично здраве – Пловдив", pool, now).map(story => story.path)).toEqual(["/news/clinic/"]);
  });

  it("selects several local topic cards, deduplicates and never fills from another topic", () => {
    const now = new Date("2026-10-26T10:00:00Z");
    const pool = [article("one", "Нови цени за синя зона в Пловдив"), article("duplicate", "Нови цени за синя зона в Пловдив"), article("two", "Платено паркиране в Пловдив с нови правила"), article("foreign", "Синя зона в София"), article("wrong", "Нов театър в Пловдив")];
    expect(cityTopicStories(["Синя и зелена зона"], pool, now).map(s => s.path)).toEqual(["/news/one/", "/news/two/"]);
    expect(cityTopicStories(["Детски градини и ясли"], pool, now)).toEqual([]);
    expect(cityTopicStories(["Синя и зелена зона"], [{ ...pool[0]!, publishedAt: new Date("2025-10-24") }, { ...pool[1]!, publishedAt: new Date("2026-10-27") }], now)).toEqual([]);
  });
  it("does not revive a past water outage as current context", () => {
    expect(cityTopicStories(["Без вода"], [article("old", "Авария остави Пловдив без вода")], new Date("2026-10-27T10:00:00Z"))).toEqual([]);
  });
  it("avoids repeated stories and obsolete temporary route or vacancy announcements", () => {
    const now = new Date("2026-10-26T10:00:00Z");
    const old = (id: string, title: string) => ({ ...article(id, title), publishedAt: new Date("2026-09-01") });
    expect(cityTopicStories(["Градски автобуси"], [old("temporary", "Пет автобусни линии в Пловдив сменят маршрутите си заради ремонт")], now)).toEqual([]);
    expect(cityTopicStories(["Детски градини и ясли"], [old("vacancies", "Свободни места в детските градини в Пловдив")], now)).toEqual([]);
    expect(cityTopicStories(["Детски градини и ясли", "Училища и градини"], [old("bypass", "348 свободни места в ясли и детски градини в Пловдив преди новата учебна година")], now)).toEqual([]);
    const variants = [article("one", "Пет автобусни линии в Пловдив сменят маршрутите си заради ремонт в Прослав"), article("two", "Пет автобусни линии в Пловдив с променени маршрути заради ремонт в Прослав")];
    expect(cityTopicStories(["Градски автобуси"], variants, now)).toHaveLength(1);
  });
  it("scopes the event cards to the selected venue or distinctive performer", () => {
    const now = new Date("2026-10-26T10:00:00Z");
    const pool = [article("bee", "Концерт на Potochkine в Bee Bop Cafe, Пловдив"), article("other", "Нов концерт в Пловдив"), article("party", "DJ парти в Bee Bop Cafe, Пловдив")];
    expect(cityAgendaContextStories(pool, ["live"], { place: "Bee Bop Café" }, now).map(s => s.path)).toEqual(["/news/bee/"]);
    expect(cityAgendaContextStories(pool, ["party"], { place: "Bee Bop Café" }, now).map(s => s.path)).toEqual(["/news/party/"]);
    expect(cityAgendaContextStories(pool, ["live"], { place: "Bee Bop Café", title: "Potochkine Live" }, now).map(s => s.path)).toEqual(["/news/bee/"]);
    expect(cityAgendaContextStories(pool, ["live"], { place: "Bushido Club" }, now)).toEqual([]);
  });
  it("links a bus line only to a recent local story naming that exact line", () => {
    const now = new Date("2026-10-25T10:00:00Z");
    const pool = [
      article("other", "Автобусна линия 124 променя маршрута си в Пловдив"),
      article("unrelated", "Тролейбусна линия 24 в София"),
      article("match", "Автобусна линия 24 с нов маршрут в Пловдив"),
    ];
    expect(cityStoryForTransitLine("24", pool, now)?.path).toBe("/news/match/");
    expect(cityStoryForTransitLine("25", pool, now)).toBeNull();
  });
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
    expect(cityStoryForTopic("Пазарите на Пловдив", [article("hours", "Ново работно време на общинските пазари в Пловдив")])?.path).toBe("/news/hours/");
    expect(cityStoryForTopic("Детски градини и ясли", [article("renovation", "Модернизират детска градина Родина")])).toBeNull();
    expect(cityStoryForTopic("Детски градини и ясли", [article("admission", "Обявиха свободните места за прием в детските градини в Пловдив")])?.path).toBe("/news/admission/");
    expect(cityStoryForTopic("Училища и градини", [article("games", "58 училища участват в Ученическите игри")])).toBeNull();
    expect(cityStoryForTopic("Училища и градини", [article("fire", "Автомобил пламна до училище в Пловдив и стресна района")])).toBeNull();
    expect(cityStoryForTopic("Училища и градини", [article("new-school", "Откриват ново училище в Пловдив")])?.path).toBe("/news/new-school/");
  });

  it("does not present past dated notices or old event coverage as a current lead", () => {
    const now = new Date("2026-10-24T10:00:00Z");
    expect(cityStoryForTopic("Мобилни пунктове", [article("expired", "Събират опасни отпадъци на 22 октомври")], now)).toBeNull();
    expect(cityStoryForTopic("Къде да изхвърля?", [article("expired", "Събират опасни отпадъци на 22 октомври")], now)).toBeNull();
    expect(cityStoryForTopic("Мобилни пунктове", [article("upcoming", "Мобилен пункт за опасни отпадъци в Пловдив на 29 октомври")], now)?.path).toBe("/news/upcoming/");
    const oldConcert = { ...article("concert", "Концерт на Моби в Пловдив"), publishedAt: new Date("2026-07-12T10:00:00Z") };
    expect(cityStoryForTopic("Концерти", [oldConcert], now)).toBeNull();
    expect(cityOutStories([oldConcert], 3, now)).toEqual([]);
  });

  it("reselects a newer, more specific article regardless of input order", () => {
    const older = { ...article("older", "Промени в платено паркиране в Пловдив"), publishedAt: new Date("2026-10-20T10:00:00Z") };
    const newer = { ...article("newer", "Синя зона в Пловдив с нови правила"), publishedAt: new Date("2026-10-24T09:00:00Z") };
    const now = new Date("2026-10-24T10:00:00Z");
    expect(cityStoryForTopic("Синя и зелена зона", [older], now)?.path).toBe("/news/older/");
    expect(cityStoryForTopic("Синя и зелена зона", [older, newer], now)?.path).toBe("/news/newer/");
    expect(cityStoryForCategory(["Синя и зелена зона", "Паркинги"], [older, newer], now)?.path).toBe("/news/newer/");
  });

  it("links an individual performance only to a headline naming that performance", () => {
    const now = new Date("2026-10-25T10:00:00Z");
    const articles = [
      article("other", "Премиера на друга постановка в театъра"),
      article("event", "Театърът в Пловдив представя Елизабет или Кралицата Девственица"),
      article("restaurant", "Ресторант Турандот отваря в Пловдив"),
      article("opera", "Опера Пловдив представя Турандот"),
    ];
    expect(cityStoryForEventTitle("ЕЛИЗАБЕТ или КРАЛИЦАТА ДЕВСТВЕНИЦА", "Театър", articles, now)?.path).toBe("/news/event/");
    expect(cityStoryForEventTitle("Турандот", "Опера и балет", articles, now)?.path).toBe("/news/opera/");
    expect(cityStoryForEventTitle("Несъществуващ спектакъл", "Театър", articles, now)).toBeNull();
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
