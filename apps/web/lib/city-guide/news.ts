import type { ArticleSummary, Media } from "../queries";
import { searchPageUrl } from "../search";
import type { AgendaKind } from "./event-agenda";

export type CityStory = {
  path: string;
  title: string;
  publishedAt: string;
  categoryName: string | null;
  hero: Media | null;
};

type NewsRule = { query: string; title: RegExp };

/** A match must be visible in a published headline. A broad shared city word is never enough. */
const TOPIC_RULES: Record<string, NewsRule> = {
  "Билети и карти": { query: "билети карти градски транспорт", title: /(?:билет|карт|тариф).*(?:градск.*транспорт|автобус)|(?:градск.*транспорт|автобус).*(?:билет|карт|тариф)/iu },
  "Пропуск за нискоемисионната зона": { query: "нискоемисионна зона пропуски", title: /нискоемисион|пропуск.*малък ринг/iu },
  "Градски автобуси": { query: "автобуси", title: /автобусн.*(линия|маршрут|разписани|спирк)|автобус.*(линия|маршрут|разписани|спирк)|градски транспорт.*(линия|маршрут|разписани|спирк)|нов[аио]? (линия|маршрут|спирк).*автобус/i },
  "Къде е автобусът?": { query: "автобуси", title: /автобус.*(реално време|GPS|проследяван|местоположени)|(?:реално време|GPS|проследяван).*автобус/i },
  "Затворени улици": { query: "затворена улица", title: /затворен[аио]? улиц|ограничен[ио]е на движени|затваря.*улиц|обходен маршрут/i },
  "Влизане в центъра": { query: "нискоемисионна зона", title: /нискоемисион|централна градска част|влизан.*център/i },
  "Вело Пловдив": { query: "велоалеи", title: /(?:нова|нови|изгражд|ремонт|маршрут|мрежа).*велоале|велоале.*(?:нова|нови|изгражд|ремонт|маршрут)|велосипедн.*инфраструктур/i },
  "Извън града": { query: "автогара", title: /автогар.*(разписани|линия|маршрут)|(?:разписани|линия|маршрут).*автогар|влак.*разписани|разписани.*влак|полет.*летище Пловдив/i },
  "Таксита": { query: "таксита", title: /такси(та|метров)?|таксиметров/i },
  "Синя и зелена зона": { query: "синя зона", title: /синя зона|зелена зона.*паркиран|паркиран.*зелена зона|платено паркиран/i },
  "Паркинги": { query: "паркинг", title: /(?:нов|общинск|изгражд|ремонт|откри).*(?<![а-я])паркинг|(?<![а-я])паркинг.*(?:откри|изгражд|ремонт|цени|общинск)|паркомест/i },
  "Пропуски и абонаменти": { query: "паркиране", title: /пропуск.*парк|абонамент.*парк/i },
  "Репатриране": { query: "репатриране", title: /репатрира|паяк.*автомобил/i },
  "Без вода": { query: "без вода", title: /без вода|водоподаван|ВиК.*авари/i },
  "Без ток": { query: "без ток", title: /без ток|прекъснат.*електрозахранван|електрическ.*авари/i },
  "Парно и топла вода": { query: "топлоподаване", title: /топлоподаван|парно|топла вода/i },
  "Улични ремонти": { query: "ремонт улица", title: /ремонт.*улиц|улиц.*ремонт|ремонт.*булевард/i },
  "Административни услуги": { query: "административни услуги", title: /административн.*услуг|общинск.*услуг|електронн.*услуг/i },
  "Местни данъци и такси": { query: "местни данъци", title: /местн.*данъц|данък.*сгради|такса смет/i },
  "Общински съвет": { query: "общински съвет", title: /общинск.*съвет|общинск.*съветниц/i },
  "Обществени обсъждания": { query: "обществено обсъждане", title: /обществен.*обсъждан|публичн.*обсъждан/i },
  "Търгове и общински имоти": { query: "общински имоти", title: /общинск.*имот|общинск.*търг/i },
  "Контакти и приемно време": { query: "община Пловдив", title: /приемно време|приемн.*общин|общинск.*контакт/i },
  "Социални услуги": { query: "социални услуги", title: /социалн.*услуг|социалн.*подкреп/i },
  "Общински жилища": { query: "общински жилища", title: /общинск.*жилищ/i },
  "Работа в общината": { query: "работа община", title: /общин.*(конкурс|свободн.*позици|обяв.*работа|назначава|търси.*управител)|работа.*общин/i },
  "Обществени поръчки": { query: "обществени поръчки", title: /обществен.*поръчк/i },
  "Бюджет и отчети": { query: "бюджет Пловдив", title: /бюджет.*Пловдив|общинск.*бюджет/i },
  "Дарения": { query: "дарения Пловдив", title: /дарени[ея].*Пловдив|Пловдив.*дарени/i },
  "Изборна информация": { query: "избори Пловдив", title: /избирателн.*секци|избори.*Пловдив/i },
  "Къде да подам сигнал?": { query: "сигнал община", title: /сигнал.*общин|подаван.*сигнал/i },
  "Пазарите на Пловдив": { query: "пазари Пловдив", title: /общинск.*пазар|пазар.*(?:работн.*време|търгов|серги|ремонт|обнов|откри|затвар|такс)|(?:ремонт|обнов|откри|затвар|търгов|серги|такс).*пазар/i },
  "Детски градини и ясли": { query: "детски градини", title: /(?:прием|класиран|свободн.*мест|нови мест|записван|кандидатстван|такс).*(?:детск.*градин|детск.*ясл)|(?:детск.*градин|детск.*ясл).*(?:прием|класиран|свободн.*мест|нови мест|записван|кандидатстван|такс)/i },
  "Първи клас": { query: "първи клас", title: /първи клас|първокласниц/i },
  "Образователен календар": { query: "учебна година", title: /учебн.*годин|образователн.*календар/i },
  "Училища и градини": { query: "училища Пловдив", title: /(?:откри|затвар|стро|ремонт|нов[аои]|адрес).*(?:училищ|детск.*градин)|(?:училищ|детск.*градин).*(?:откри|затвар|стро|ремонт|нов[аои]|адрес)/i },
  "Помощи за родители": { query: "помощи родители", title: /помощ.*родител|компенсаци.*градин/i },
  "Занимания за деца": { query: "занимания деца", title: /детск.*работилниц|занимани.*деца|ваканционн.*програм/i },
  "Университети и студенти": { query: "университет Пловдив", title: /университет|студент|общежити|стипенди/i },
  "Работа в образованието": { query: "учители Пловдив", title: /учител.*(конкурс|работа|търси|назнач)|работа.*учител/i },
  "Студентски общности": { query: "студентски събития", title: /студентск.*(събит|организац|клуб)|младежк.*обучени/i },
  "Работа за млади хора": { query: "стаж Пловдив", title: /стаж.*Пловдив|младежк.*заетост|първа работа/i },
  "Въздухът в Пловдив": { query: "въздух Пловдив", title: /замърс.*въздух|качество.*въздух|фини прахови частиц|ФПЧ/i },
  "Чистота и сметосъбиране": { query: "сметосъбиране", title: /сметосъбиран|почистван.*Пловдив|отпадъц.*Пловдив/i },
  "Паркове и зелени площи": { query: "паркове Пловдив", title: /парк.*Пловдив|зелен.*площ|озеленяван/i },
  "Комари и кърлежи": { query: "обработка комари", title: /комар|кърлеж|дезинсекц/i },
  "Нивото на Марица": { query: "Марица ниво", title: /ниво.*Марица|Марица.*нив|водосбор.*Марица/i },
  "Къде да изхвърля?": { query: "отпадъци Пловдив", title: /пункт.*отпадъц|разделно събиран|опасн.*отпадъц/i },
  "Мобилни пунктове": { query: "мобилен пункт", title: /мобилн.*пункт|опасн.*отпадъц/i },
  "Шум в града": { query: "шум Пловдив", title: /шум.*Пловдив|Пловдив.*шум/i },
  "Метеоизмервания": { query: "времето Пловдив", title: /метеорологичн.*измерван|измерван.*времето/i },
  "Дървета и озеленяване": { query: "дървета Пловдив", title: /дървет|озеленяван/i },
  "Домашни любимци": { query: "домашни любимци", title: /домашн.*любимц|регистраци.*кучет/i },
  "Театър": { query: "театър Пловдив", title: /постановк|спектак|театралн|театър.*(?:премиер|програм|сцен)/i },
  "Опера и балет": { query: "опера Пловдив", title: /(?:^|[^а-я])опера(?:та)?(?=[^а-я]|$)|балет/i },
  "Концерти": { query: "концерт Пловдив", title: /концерт|музикалн.*събити/i },
  "Фестивали": { query: "фестивал Пловдив", title: /фестивал/i },
  "Изложби": { query: "изложба Пловдив", title: /изложб|галери/i },
  "За деца": { query: "детски събития", title: /детск.*(спектак|събит|представлен)|представлен.*деца/i },
  "Литература": { query: "литературни събития", title: /книжн.*премиер|литератур|писателск.*срещ/i },
  "Читалища и школи": { query: "читалище Пловдив", title: /читалищ|творческ.*школ/i },
  "Спорт": { query: "спорт Пловдив", title: /спортн.*събити|спортн.*инициатив|спортн.*клуб/i },
  "Пловдив OUT": { query: "събития Пловдив", title: /клубн.*събити|Пловдив OUT|нощен живот/i },
  "Животни за осиновяване": { query: "осиновяване кучета", title: /осиновяван.*(куч|животн)|куч.*осиновяван/i },
  "Как да осиновя?": { query: "осиновяване кучета", title: /осиновяван.*(куч|животн)|куч.*осиновяван/i },
};

const OUT_QUERIES: Record<string, string> = {
  "Тази вечер": "събития Пловдив", "Уикенда": "уикенд Пловдив", "Предстоящи": "събития Пловдив",
  "Безплатно": "безплатни събития", "Партита": "парти Пловдив", "Концерти": "концерт Пловдив",
  "DJ и електронна музика": "DJ Пловдив", "Рап и хип-хоп": "рап Пловдив",
  "Попфолк, балканска и турска музика": "балканска музика Пловдив", "Музика на живо": "музика на живо",
  "Студентски вечери": "студентски събития", "Стендъп": "стендъп Пловдив", "Куизове": "куиз Пловдив",
  "Настолни игри": "настолни игри", "Гейминг": "гейминг Пловдив", "Творчески работилници": "работилници Пловдив",
  "Младежки инициативи": "младежки инициативи", "Доброволчество и обучения": "доброволчество Пловдив",
};

const OUT_STORY_TITLE = /концерт|(?:^|[^а-я])опера(?:та)?(?=[^а-я]|$)|балет|постановк|спектак|фестивал|изложб|театралн|джаз|музикалн.*събит|музика на живо|диджей|\bDJ\b/i;
const TIME_BOUND_TITLE = /днес|тази вечер|утре|този уикенд/i;
const EVENT_TOPICS = new Set(["Къде да изхвърля?", "Мобилни пунктове", "Занимания за деца", "Студентски общности", "Театър", "Опера и балет", "Концерти", "Фестивали", "Изложби", "За деца", "Литература", "Спорт", "Младежки инициативи", "Пловдив OUT", "Културен афиш"]);
const EVENT_MONTHS: Record<string, number> = { януари: 1, февруари: 2, март: 3, април: 4, май: 5, юни: 6, юли: 7, август: 8, септември: 9, октомври: 10, ноември: 11, декември: 12 };
const EVENT_DATE_TITLE = /(?:^|\D)(\d{1,2})\s+(януари|февруари|март|април|май|юни|юли|август|септември|октомври|ноември|декември)(?:\s+(20\d{2}))?/i;
const EVENT_NEWS_MAX_AGE_MS = 30 * 86_400_000;

function eligibleStory(article: ArticleSummary, now: Date, topic?: string): boolean {
  const localDay = (date: Date) => date.toLocaleDateString("sv-SE", { timeZone: "Europe/Sofia" });
  if (TIME_BOUND_TITLE.test(article.title) && localDay(article.publishedAt) !== localDay(now)) return false;
  if (topic && EVENT_TOPICS.has(topic) && now.getTime() - article.publishedAt.getTime() > EVENT_NEWS_MAX_AGE_MS) return false;
  const match = article.title.match(EVENT_DATE_TITLE);
  if (!match) return true;
  const day = Number(match[1]);
  const month = EVENT_MONTHS[match[2]?.toLocaleLowerCase("bg") ?? ""];
  if (!month || day < 1 || day > 31) return true;
  let year = match[3] ? Number(match[3]) : article.publishedAt.getUTCFullYear();
  if (!match[3] && article.publishedAt.getUTCMonth() === 11 && month === 1) year += 1;
  const eventDay = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return eventDay >= localDay(now);
}

function storyScore(article: ArticleSummary, query: string, now: Date): number {
  const title = article.title.toLocaleLowerCase("bg");
  const excerpt = article.excerpt.toLocaleLowerCase("bg");
  const terms = query.toLocaleLowerCase("bg").split(/[^\p{L}\p{N}]+/u)
    .filter(term => term.length >= 4 && term !== "пловдив")
    .map(term => term.slice(0, Math.min(5, term.length)));
  const relevance = terms.reduce((score, term) => score + (title.includes(term) ? 18 : excerpt.includes(term) ? 5 : 0), 0);
  const ageDays = Math.max(0, (now.getTime() - article.publishedAt.getTime()) / 86_400_000);
  return relevance + 30 * Math.exp(-ageDays / 14);
}

function rankStories(articles: ArticleSummary[], query: string, now: Date): ArticleSummary[] {
  return [...articles].sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime()
    || storyScore(b, query, now) - storyScore(a, query, now) || a.id.localeCompare(b.id));
}

export function cityNewsUrl(topic: string): string {
  return searchPageUrl(TOPIC_RULES[topic]?.query ?? OUT_QUERIES[topic] ?? topic);
}

export function cityStoryForTopic(topic: string, articles: ArticleSummary[], now = new Date()): CityStory | null {
  const rule = TOPIC_RULES[topic];
  if (!rule) return null;
  return cityTopicStories([topic], articles, now, 1)[0] ?? null;
}

export function toCityStory(article: ArticleSummary): CityStory {
  return {
    path: article.path, title: article.title, publishedAt: article.publishedAt.toISOString(),
    categoryName: article.category?.name ?? null, hero: article.hero,
  };
}

export function cityStoriesForTopics(topics: readonly string[], articles: ArticleSummary[], now = new Date()): Record<string, CityStory | null> {
  return Object.fromEntries(topics.map(topic => [topic, cityStoryForTopic(topic, articles, now)]));
}

/** Small, dated reading selection for the active screen; never a search fallback. */
export function cityTopicStories(topics: readonly string[], articles: ArticleSummary[], now = new Date(), limit = 3): CityStory[] {
  const scored = articles.flatMap(article => {
    const age = now.getTime() - article.publishedAt.getTime();
    if (!Number.isFinite(age) || age < 0 || age > 120 * 86_400_000 || !/пловдив/iu.test(`${article.title} ${article.excerpt} ${article.category?.name ?? ""}`)) return [];
    if (age > 30 * 86_400_000 && /свободн.*мест.*(?:градин|ясл)|(?:градин|ясл).*свободн.*мест|автобусн.*лини.*заради ремонт/iu.test(article.title)) return [];
    const scores = topics.flatMap(topic => {
      const rule = TOPIC_RULES[topic];
      if (!rule || !rule.title.test(article.title) || !eligibleStory(article, now, topic)) return [];
      if (topic === "Въздухът в Пловдив" && !/пловдив/iu.test(article.title)) return [];
      // Outage headlines are useful for today's situation, not an old incident.
      if (["Без вода", "Без ток", "Парно и топла вода"].includes(topic) && age > 2 * 86_400_000) return [];
      if (age > 30 * 86_400_000 && (
        topic === "Градски автобуси" && /заради ремонт|времен.*маршрут/iu.test(article.title)
        || topic === "Детски градини и ясли" && /свободн.*мест|прием|класиран/iu.test(article.title)
      )) return [];
      return [storyScore(article, rule.query, now)];
    });
    return scores.length ? [{ article, score: Math.max(...scores) }] : [];
  });
  const seen = new Set<string>();
  const signatures: Set<string>[] = [];
  return scored.sort((a, b) => b.article.publishedAt.getTime() - a.article.publishedAt.getTime() || b.score - a.score).filter(({ article }) => {
    const title = article.title.toLocaleLowerCase("bg").replace(/[^\p{L}\p{N}]/gu, "");
    if (seen.has(article.path) || seen.has(title)) return false;
    const terms = new Set((article.title.toLocaleLowerCase("bg").match(/[\p{L}\p{N}]+/gu) ?? []).filter(term => term.length > 3 && term !== "пловдив").map(term => term.slice(0, 6)));
    if (signatures.some(previous => {
      const shared = [...terms].filter(term => previous.has(term)).length;
      return shared >= 5 && shared / Math.min(previous.size, terms.size) >= .75;
    })) return false;
    signatures.push(terms);
    seen.add(article.path); seen.add(title); return true;
  }).slice(0, limit).map(({ article }) => toCityStory(article));
}

export function cityStoryForCategory(topics: readonly string[], articles: ArticleSummary[], now = new Date()): CityStory | null {
  return cityTopicStories(topics, articles, now, 1)[0] ?? null;
}

/** Exact line context follows the selected timetable; never another line's headline. */
export function cityTransitLineStories(line: string, articles: ArticleSummary[], now = new Date()): CityStory[] {
  if (!/^\d{1,3}$/u.test(line)) return [];
  const number = new RegExp(`(?:линия|линии|маршрут|маршрути)\\s*(?:№\\s*)?${line}(?!\\d)`, "iu");
  return cityTopicStories(["Градски автобуси"], articles.filter(article => number.test(article.title)), now);
}

/** Restrict an expanded procedure to its named company, institution or distinctive subject. */
export function cityRecordStories(topic: string, title: string, articles: ArticleSummary[], now = new Date()): CityStory[] {
  const generic = /^(?:пловдив|общин|конкурс|управ|обяв|проект|наредб|кандидат|услов|документ|измен|допъл|правил|търг|имот|дейност|предлож|решен|дружеств|център|еоод|еад|техните|общите|за|на|от|при)/u;
  const stems = (value: string) => (value.toLocaleLowerCase("bg").match(/[\p{L}\p{N}]+/gu) ?? []).filter(word => word.length >= 4 && !generic.test(word)).map(word => word.slice(0, 6));
  const terms = [...new Set(stems(title))];
  if (!terms.length) return [];
  return cityTopicStories([topic], articles.filter(article => {
    if (/център за психично здраве/iu.test(title) && /психодиспансер/iu.test(article.title)) return true;
    const headline = new Set(stems(article.title));
    return terms.filter(term => headline.has(term)).length >= Math.min(2, terms.length);
  }), now);
}

/** Link a programme row to a story only when its distinctive title is in the headline. */
export function cityStoryForEventTitle(title: string, topic: "Театър" | "Опера и балет" | "Изложби" | "Младежки инициативи" | "Пловдив OUT" | "Културен афиш", articles: ArticleSummary[], now = new Date()): CityStory | null {
  const terms = [...new Set((title.toLocaleLowerCase("bg").match(/[\p{L}\p{N}]+/gu) ?? []).filter(term => term.length >= 5))];
  if (!terms.length) return null;
  const context = topic === "Театър" ? /театър|театралн|постановк|спектак/u : topic === "Опера и балет" ? /опера|балет/u : topic === "Изложби" ? /изложб|галери/u : null;
  const candidates = articles.filter(article => {
    if (!eligibleStory(article, now, topic)) return false;
    if (context && !context.test(article.title.toLocaleLowerCase("bg"))) return false;
    const headline = new Set(article.title.toLocaleLowerCase("bg").match(/[\p{L}\p{N}]+/gu) ?? []);
    return terms.every(term => headline.has(term));
  });
  const match = rankStories(candidates, title, now)[0];
  return match ? toCityStory(match) : null;
}

/** Require both the exact route number and bus context in a recent local headline. */
export function cityStoryForTransitLine(line: string, articles: ArticleSummary[], now = new Date()): CityStory | null {
  if (!/^\d{1,3}$/u.test(line)) return null;
  const routeNumber = new RegExp(`(?:^|[^\\p{L}\\p{N}])${line}(?!\\d)`, "u");
  const candidates = articles.filter(article => {
    const title = article.title.toLocaleLowerCase("bg");
    const local = /пловдив/iu.test(`${article.title} ${article.excerpt} ${article.category?.name ?? ""}`);
    return local && /автобус|градски транспорт/iu.test(title) && /линия|маршрут/iu.test(title)
      && routeNumber.test(title) && now.getTime() - article.publishedAt.getTime() <= 45 * 86_400_000
      && eligibleStory(article, now);
  });
  const match = rankStories(candidates, `автобус линия ${line} Пловдив`, now)[0];
  return match ? toCityStory(match) : null;
}

export function cityOutStories(articles: ArticleSummary[], limit = 3, now = new Date()): CityStory[] {
  return rankStories(articles.filter(article => OUT_STORY_TITLE.test(article.title) && eligibleStory(article, now, "Пловдив OUT")), "концерт фестивал театър музика", now)
    .slice(0, limit).map(toCityStory);
}

const AGENDA_NEWS: Record<AgendaKind, RegExp> = {
  quiz: /куиз|quiz|викторин/iu,
  party: /(?:^|[^а-я])парти(?:то|та)?(?=[^а-я]|$)|диджей|\bDJ\b|клубна.*музика/iu,
  live: /концерт|музика на живо|джаз|рок груп/iu,
  standup: /стенд[ -]?ъп|stand[ -]?up/iu,
  theatre: /театрал|постановк|спектак|драматичн.*театър|театър.*(?:премиер|програм|сцен)/iu,
  opera: /(?:^|[^а-я])(?:опера(?:та)?|балет[а-я]*)(?=[^а-я]|$)|симфони/iu,
  exhibition: /изложб|галери/iu,
  community: /работилниц|младежк.*(?:форум|център|инициатив|обучени)|предприемач.*(?:форум|срещ|събити)|творческ.*срещ/iu,
};
export function cityAgendaStories(articles: ArticleSummary[], kinds: AgendaKind[], now = new Date()): CityStory[] {
  const seen = new Set<string>();
  return articles.filter(article => {
    const age = now.getTime() - article.publishedAt.getTime();
    const retrospective = /след концерта|закри|откриха|отбеляза|представи|премиерата|спечели|награда/iu.test(article.title);
    return age >= 0 && age <= 180 * 86_400_000 && (age <= EVENT_NEWS_MAX_AGE_MS || retrospective) && eligibleStory(article, now)
      && !/парти[яи]|ДАНС|прокуратур|кръводар|птичи грип|пожарник|за деца|за кучета|церемони|водосвет|бойните знамена|убийств|насили|агресия|катастроф|жесток бой|голов спектакъл/iu.test(article.title)
      && /пловдив/iu.test(`${article.title} ${article.excerpt} ${article.category?.name ?? ""}`)
      && kinds.some(kind => AGENDA_NEWS[kind].test(article.title));
  }).sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime()).filter(article => {
    const key = article.title.toLocaleLowerCase("bg").replace(/[^\p{L}\p{N}]/gu, "");
    if (seen.has(key) || seen.has(article.path)) return false;
    seen.add(key); seen.add(article.path); return true;
  }).slice(0, 4).map(toCityStory);
}

export function cityAgendaContextStories(articles: ArticleSummary[], kinds: AgendaKind[], context: { place?: string; title?: string }, now = new Date()): CityStory[] {
  const normalize = (text: string) => text.normalize("NFKD").replace(/\p{M}/gu, "").toLocaleLowerCase("bg").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const place = normalize(context.place ?? "");
  const generic = new Set(["live", "concert", "концерт", "пловдив", "plovdiv", "club", "cafe", "рок", "rock", "bar", "party", "night", "event", "center", "tribute", "band", "stand", "стендъп", "halloween"]);
  const placeWords = new Set(place.split(" "));
  const words = [...new Set(normalize(context.title ?? "").split(" ").filter(word => word.length >= 4 && !/^\d+$/u.test(word) && !generic.has(word) && !placeWords.has(word)))];
  const scoped = articles.filter(article => {
    const headline = normalize(article.title);
    if (context.title) return words.length > 0 && words.slice(0, 3).every(word => headline.split(" ").includes(word));
    return place.length > 3 && headline.includes(place);
  });
  return cityAgendaStories(scoped, kinds, now);
}

/** A named parking venue must never inherit headlines about unrelated car parks. */
export function cityParkingVenueStories(sourceId:string,articles:ArticleSummary[],now=new Date()):CityStory[]{
 const name=sourceId==="mall-plovdiv-parking"?/мол\s+пловдив|mall\s+plovdiv/iu:sourceId==="markovo-tepe-parking"?/марково\s+тепе|markovo\s+tepe/iu:null;
 return name?cityTopicStories(["Паркинги"],articles.filter(a=>name.test(a.title)),now):[];
}
