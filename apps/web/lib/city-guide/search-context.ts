import { CITY_CATEGORY_SOURCES, CITY_DEFERRED_CATEGORIES, citySourceInRelease } from "@newspoint/content/city-sources";
import { CITY_CATEGORIES } from "./catalog";
import type { CityObservation } from "./local-observations";

/** Names describe the actual publishing source, not an endorsement or affiliation. */
const SOURCE_LABELS: Record<string, string> = {
  "plovdiv-livetransport-gtfs": "LiveTransport — градски автобусни разписания",
  "plovdiv-transit-documents": "Община Пловдив — документи за градския транспорт",
  "karat-plovdiv-sofia": "Карат-С — Пловдив–София",
  "union-plovdiv-burgas": "Юнион Ивкони — Пловдив–Бургас",
  "union-plovdiv-varna": "Юнион Ивкони — Пловдив–Варна",
  "plovdiv-airport-flights": "Летище Пловдив — разписание на полетите",
  "vivacom-plovdiv-parking": "Vivacom — SMS паркиране",
  "mall-plovdiv-parking": "Mall Plovdiv — условия за паркиране",
  "markovo-tepe-parking": "Мол Марково тепе — условия за паркиране",
  "vik-outages": "ВиК Пловдив — бюлетин за прекъсвания",
  "elyug-planned-plovdiv-region": "Електроразпределение Юг — планирани изключвания",
  "evn-heating-outages": "EVN — топлоподаване",
  "dz-admission-calendar": "Общинската система за прием в градини и ясли — календар",
  "dz-vacancies": "Общинската система за прием в градини и ясли — места",
  "dz-institutions": "Общинската система за прием в градини и ясли — заведения",
  "first-grade-vacancies": "Общинската система за прием в първи клас — места",
  "plovdiv-community-air": "Sensor.Community — граждански измервания на въздуха",
  "chistota-bulky-waste": "ОП „Чистота“ Пловдив — едрогабаритни отпадъци",
  "balbok-plovdiv-campaigns": "БалБок — кампании за опасни отпадъци",
  "ecopack-containers": "ЕКОПАК — карта на контейнерите",
  "plovdiv-theatre": "Драматичен театър Пловдив — програма",
  "plovdiv-opera": "Опера Пловдив — програма",
  "plovdiv-gallery-current": "Градска художествена галерия Пловдив — изложби",
  "plovdiv-youth-centre": "Младежки център Пловдив — събития",
  "epaygo-plovdiv-explicit": "ePayGo — публикувани събития в Пловдив",
  "lohi-programme": "Lo/Hi Craft Space — програма",
  "club-code-upcoming": "Club CODE — предстоящи събития",
  "bilet-sinatra": "Bilet.bg — Пиано бар Синатра Пловдив",
  "bilet-beebop": "Bilet.bg — Bee Bop Café",
  "bilet-download": "Bilet.bg — Rock Bar Download",
  "bilet-plovdiv-event-center": "Bilet.bg — Plovdiv Event Center",
  "bilet-colodrome": "Bilet.bg — Арена Колодрум Пловдив",
  "bilet-elum": "Bilet.bg — Elum club",
  "goliamata-maritsa-programme": "Plovdiv24 — Клуб Ресторант Голямата Марица",
  "bushido-programme": "Plovdiv24 — Bushido Club",
  "plovdiv-live-club-events": "Live Club Plovdiv — събития",
};

export function cityContextSourceName(sourceId: string): string | null {
  return Object.hasOwn(SOURCE_LABELS, sourceId) ? SOURCE_LABELS[sourceId]! : null;
}

const GUIDANCE: Record<string, { question: string; answer: string; scope: string }> = {
  transport: {
    question: "Как да намеря разписание на автобус в Пловдив?",
    answer: "В „Транспорт и движение“ избери справката за градски автобуси, после линия, посока и спирка. За междуградски автобус избери направление и провери датата и точната спирка на курса.",
    scope: "Часовете са по публикуваното разписание и не показват местоположение на автобус в реално време. Междуградската справка обхваща наличните превозвачи и направления, а не всички автобуси от Пловдив.",
  },
  parking: {
    question: "Как да проверя условията за паркиране в Пловдив?",
    answer: "В „Паркиране“ избери наличната справка за зона или паркинг и провери публикуваните условия, часове и начин на плащане.",
    scope: "Условията се отнасят за конкретния оператор или зона. Справките не показват свободни паркоместа в реално време; обозначенията на място могат да съдържат допълнителни ограничения.",
  },
  outages: {
    question: "Къде да проверя за спиране на вода, ток или парно в Пловдив?",
    answer: "В „Аварии и ремонти“ избери вида прекъсване и потърси адреса си в наличната справка. Сравни датата, засегнатите адреси и посочения от оператора срок.",
    scope: "Справката за ток е за планирани изключвания. Посочените срокове за възстановяване могат да се променят; липсата на запис не потвърждава, че няма авария или че услугата е възстановена.",
  },
  education: {
    question: "Как да проверя прием и места в детски градини и училища в Пловдив?",
    answer: "В „Образование и деца“ избери наличната справка за прием, календар или заведения. Провери за кое класиране, възрастова група и дата се отнасят данните.",
    scope: "Публикуваните места не гарантират прием. „Моят Пловдив“ не подава заявления и не показва индивидуални резултати от класирането.",
  },
  environment: {
    question: "Къде да намеря информация за въздуха и отпадъците в Пловдив?",
    answer: "В „Градска среда“ избери наличната справка за измервания, контейнери или предаване на отпадъци. При кампания провери вида отпадък, адреса и обявената дата.",
    scope: "Гражданските измервания от Sensor.Community не са официална оценка на качеството на въздуха. Картата на контейнерите обхваща публикуваните от оператора точки и не показва запълването им.",
  },
  culture: {
    question: "Как да намеря културни събития в Пловдив?",
    answer: "В „Култура и събития“ избери ден или вид събитие, после отвори заглавието за наличните дата, час, място и описание.",
    scope: "Афишът събира публикувани програми от включените сцени и издатели. Той не обхваща всяко събитие в Пловдив и не гарантира налични билети; организаторът може да промени програмата.",
  },
  nightlife: {
    question: "Какво да посетя тази вечер в Пловдив?",
    answer: "В „Нощен Пловдив“ избери „Днес“ или конкретна дата и филтрирай по място или интерес. Отвори събитието, за да видиш обявените часове и подробности.",
    scope: "Показват се програмите от включените места и издатели, а не всички заведения. Часът за отваряне на вратите може да е различен от началото; достъпът и резервациите се уточняват с организатора.",
  },
  municipality: {
    question: "Как да ползвам справките за Община Пловдив?",
    answer: "В „Община и институции“ избери наличната справка и провери конкретните условия, документи и срокове.",
    scope: "Справката има информационна цел. Тя не подава заявление, не извършва плащане и не потвърждава индивидуално право на услуга.",
  },
  adopt: {
    question: "Как да потърся информация за осиновяване в Пловдив?",
    answer: "В „Осинови приятел“ разгледай наличната информация за животни и условията за посещение.",
    scope: "Публикуван профил не гарантира, че животното все още е за осиновяване. Наличността и условията се потвърждават от приюта.",
  },
};

export function cityContextGuidance(categorySlug?: string) {
  return categorySlug && Object.hasOwn(GUIDANCE, categorySlug) ? GUIDANCE[categorySlug]! : {
    question: "Какво е „Моят Пловдив“?",
    answer: "„Моят Пловдив“ е градският справочник на NewsPoint.bg. Той събира практична информация за Пловдив и свързани новини от редакцията. Избери раздел или потърси тема, за да стигнеш до наличните справки.",
    scope: "Показват се разделите с налично съдържание. Обхватът зависи от включените източници; липсваща справка не означава, че няма услуга, събитие или проблем.",
  };
}

export function cityContextLinks(availableSlugs: readonly string[], categorySlug?: string) {
  return CITY_CATEGORIES.filter(category => availableSlugs.includes(category.slug) && category.slug !== categorySlug && !CITY_DEFERRED_CATEGORIES.includes(category.slug))
    .map(category => ({ title: category.title, href: `/moyat-plovdiv/${category.slug}/` }));
}

export function cityContextSources(groups: readonly CityObservation[], categorySlug?: string) {
  const allowed = new Set(categorySlug ? CITY_CATEGORY_SOURCES[categorySlug] ?? [] : Object.values(CITY_CATEGORY_SOURCES).flat());
  const unique = new Map<string, CityObservation>();
  for (const group of groups) {
    if (!allowed.has(group.sourceId) || !citySourceInRelease(group.sourceId) || !SOURCE_LABELS[group.sourceId]) continue;
    const previous = unique.get(group.sourceId);
    const observedAt = Date.parse(group.checkedAt), previousAt = previous ? Date.parse(previous.checkedAt) : NaN;
    if (!previous || Number.isFinite(observedAt) && (!Number.isFinite(previousAt) || observedAt > previousAt)
      || group.checkedAt === previous.checkedAt && group.status === previous.status && group.items.length > previous.items.length) unique.set(group.sourceId, group);
  }
  return [...unique.values()].map(group => ({
    id: group.sourceId,
    name: SOURCE_LABELS[group.sourceId]!,
    checkedAt: Number.isFinite(Date.parse(group.checkedAt)) ? group.checkedAt : null,
    timeLabel: group.status === "unavailable" ? "Последен опит" : "Получена справка",
    status: group.status === "unavailable" ? "Временно недостъпна" : group.status === "stale" ? "Очаква обновяване" : group.items.length ? "Има текущи записи" : "Няма текущи записи в получената справка",
    partial: group.completeness === "uncertain",
  }));
}
