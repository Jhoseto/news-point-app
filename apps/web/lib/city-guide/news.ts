import type { ArticleSummary, Media } from "../queries";
import { searchPageUrl } from "../search";

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
  "Работа в общината": { query: "работа община", title: /общин.*(конкурс|свободн.*позици|обяв.*работа|назначава)|работа.*общин/i },
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
const EVENT_TOPICS = new Set(["Къде да изхвърля?", "Мобилни пунктове", "Занимания за деца", "Студентски общности", "Театър", "Опера и балет", "Концерти", "Фестивали", "Изложби", "За деца", "Литература", "Спорт", "Пловдив OUT"]);
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
  return [...articles].sort((a, b) => storyScore(b, query, now) - storyScore(a, query, now)
    || b.publishedAt.getTime() - a.publishedAt.getTime() || a.id.localeCompare(b.id));
}

export function cityNewsUrl(topic: string): string {
  return searchPageUrl(TOPIC_RULES[topic]?.query ?? OUT_QUERIES[topic] ?? topic);
}

export function cityStoryForTopic(topic: string, articles: ArticleSummary[], now = new Date()): CityStory | null {
  const rule = TOPIC_RULES[topic];
  if (!rule) return null;
  const article = rankStories(articles.filter(candidate => rule.title.test(candidate.title) && eligibleStory(candidate, now, topic)), rule.query, now)[0];
  return article ? toCityStory(article) : null;
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

export function cityStoryForCategory(topics: readonly string[], articles: ArticleSummary[], now = new Date()): CityStory | null {
  const candidates = topics.flatMap(topic => {
    const rule = TOPIC_RULES[topic];
    return rule ? articles.filter(article => rule.title.test(article.title) && eligibleStory(article, now, topic))
      .map(article => ({ article, score: storyScore(article, rule.query, now) })) : [];
  });
  candidates.sort((a, b) => b.score - a.score || b.article.publishedAt.getTime() - a.article.publishedAt.getTime()
    || a.article.id.localeCompare(b.article.id));
  return candidates[0] ? toCityStory(candidates[0].article) : null;
}

export function cityOutStories(articles: ArticleSummary[], limit = 3, now = new Date()): CityStory[] {
  return rankStories(articles.filter(article => OUT_STORY_TITLE.test(article.title) && eligibleStory(article, now, "Пловдив OUT")), "концерт фестивал театър музика", now)
    .slice(0, limit).map(toCityStory);
}
