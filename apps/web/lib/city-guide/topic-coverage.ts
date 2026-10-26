import { CITY_CATEGORIES } from "./catalog";
import { explicitNightEventKind } from "./event-kind";
import type { CityObservation } from "./local-observations";
import { CITY_PRESENTATION, readerCityGroups } from "./presentation";

const TOPIC_SOURCES: Record<string, Record<string, readonly string[]>> = {
  transport: {
    "Градски автобуси": ["plovdiv-livetransport-gtfs"],
    "Влизане в центъра": ["plovdiv-low-emission"],
    "Извън града": ["plovdiv-airport-flights"],
    "Билети и карти": ["plovdiv-transit"],
  },
  parking: {
    "Синя и зелена зона": ["plovdiv-parking-rules"],
    "Репатриране": ["plovdiv-parking-operator"],
  },
  outages: {
    "Без вода": ["vik-outages"],
    "Парно и топла вода": ["evn-heating-outages"],
  },
  municipality: {
    "Работа в общината": ["plovdiv-management-competitions"],
    "Търгове и общински имоти": ["plovdiv-auction-list"],
    "Общински жилища": ["plovdiv-housing"],
    "Обществени обсъждания": ["plovdiv-public-consultations"],
    "Местни данъци и такси": ["plovdiv-tax-notices", "plovdiv-taxes"],
    "Общински съвет": ["plovdiv-council"],
    "Социални услуги": ["plovdiv-social-services"],
    "Контакти и приемно време": ["plovdiv-contacts"],
    "Къде да подам сигнал?": ["plovdiv-eco-signals", "plovdiv-transport-signals"],
  },
  education: {
    "Детски градини и ясли": ["dz-vacancies", "dz-institutions"],
    "Първи клас": ["first-grade-vacancies"],
    "Училища и градини": ["plovdiv-municipal-schools", "dz-institutions"],
  },
  environment: {
    "Чистота и сметосъбиране": ["ecomap-containers"],
    "Паркове и зелени площи": ["plovdiv-eco-signals"],
    "Комари и кърлежи": ["plovdiv-eco-signals"],
    "Къде да изхвърля?": ["chistota-bulky-waste", "ecomap-containers"],
    "Мобилни пунктове": ["ecomap-collection-events"],
    "Домашни любимци": ["plovdiv-eco-signals"],
  },
  culture: {
    "Театър": ["plovdiv-theatre"],
    "Опера и балет": ["plovdiv-opera"],
    "Изложби": ["plovdiv-gallery-current"],
  },
  adopt: {
    "Животни за осиновяване": ["plovdiv-dog-shelter"],
    "Как да осиновя?": ["plovdiv-adoption-guide"],
  },
  nightlife: {
    "Младежки инициативи": ["plovdiv-youth-centre"],
    "Предстоящи": ["club-code-upcoming"],
    "Партита": ["club-code-upcoming"],
    "Музика на живо": ["epaygo-plovdiv-explicit"],
    "Стендъп": ["epaygo-plovdiv-explicit"],
  },
};

export function cityAvailableTopics(categorySlug: string, groups: CityObservation[]): { title: string; href: string }[] {
  const category = CITY_CATEGORIES.find(entry => entry.slug === categorySlug);
  if (!category) return [];
  const observed = new Set(readerCityGroups(groups).filter(group => !CITY_PRESENTATION[group.sourceId]?.utility).map(group => group.sourceId));
  return category.topics.flatMap(topic => {
    const sourceId = TOPIC_SOURCES[categorySlug]?.[topic.title]?.find(id => {
      if (!observed.has(id)) return false;
      if (categorySlug !== "nightlife" || id !== "epaygo-plovdiv-explicit") return true;
      const kind = topic.title === "Музика на живо" ? "live" : topic.title === "Стендъп" ? "standup" : null;
      return !!kind && !!groups.find(group => group.sourceId === id)?.items.some(item => explicitNightEventKind(item.fields) === kind);
    });
    if (!sourceId) return [];
    const kind = categorySlug === "nightlife" && sourceId === "epaygo-plovdiv-explicit" ? topic.title === "Музика на живо" ? "live" : "standup" : null;
    const firstMatching = kind ? groups.find(group => group.sourceId === sourceId)?.items.find(item => explicitNightEventKind(item.fields) === kind) : null;
    return [{ title: topic.title, href: firstMatching ? `#city-record-${sourceId}-${encodeURIComponent(firstMatching.key)}` : sourceId === "club-code-upcoming" ? "#city-agenda-title" : `#nablyudavani-${sourceId}` }];
  });
}
