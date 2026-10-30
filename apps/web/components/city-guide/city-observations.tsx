import { CityParkingVenue } from "./city-parking-venue";
import { CityAirQuality } from "./city-air-quality";
import { CityLowEmissionPermit } from "./city-low-emission-permit";
import { CityAdmissionCalendar } from "./city-admission-calendar";
import { CityTransitTimetable } from "./city-transit-timetable";
import { cityIntercityRoute } from "@newspoint/content/city-intercity";
import { CityIntercityTimetable } from "./city-intercity-timetable";
import { CityTransitDocuments } from "./city-transit-documents";
import { cityIntercitySources } from "@/lib/city-guide/intercity";
import { cityTransitDocument } from "@/lib/city-guide/transit-documents";
import Link from "next/link";
import type { CityObservation } from "@/lib/city-guide/local-observations";
import type { ArticleSummary } from "@/lib/queries";
import { cityTopicStories, cityParkingVenueStories, cityTransitLineStories, cityRecordStories, type CityStory } from "@/lib/city-guide/news";
import { nightEventStatusLabel } from "@/lib/city-guide/night-events";
import { CityDogGallery } from "./city-dog-gallery";
import { CitySocialServices } from "./city-social-services";
import { CitySchoolDirectory } from "./city-school-directory";
import { CityEcoPoints } from "./city-eco-points";
import { CITY_PRESENTATION, readerCityGroups, MUNICIPAL_RECORD_SOURCES } from "@/lib/city-guide/presentation";
import { CityRelatedNews } from "./city-related-news";
import { CityWorkspace, type CityWorkspaceSection } from "./city-workspace";
import { CityMunicipalRecords } from "./city-municipal-records";

const SOURCE_NAMES: Record<string, string> = {
  "balbok-plovdiv-campaigns": "Мобилни пунктове за опасни отпадъци",
  "vivacom-plovdiv-parking": "SMS паркиране · Vivacom",
  "plovdiv-transit": "Посочени цени за градски транспорт",
  "plovdiv-livetransport-gtfs": "Автобусни линии за днешния ден",
  "plovdiv-airport-flights": "Пристигащи и заминаващи полети",
  "plovdiv-low-emission": "Нискоемисионна зона „Малък ринг“",
  "plovdiv-parking-rules": "Правила за паркиране в Пловдив",
  "plovdiv-parking-operator": "Контакти · паркиране и репатриране",
  "vik-outages": "Водоснабдяване в Пловдив",
  "evn-heating-outages": "Топлоподаване · аварии и ремонти",
  "plovdiv-council": "Дневен ред на Общинския съвет",
  "dz-vacancies": "Места в детски градини и ясли",
  "dz-institutions": "Детски градини и ясли · общински каталог",
  "first-grade-vacancies": "Първи клас · публикувани места",
  "plovdiv-municipal-schools": "Общински училища · публикуван каталог",
  "plovdiv-social-services": "Социални услуги · общински каталог",
  "chistota-bulky-waste": "Едрогабаритни отпадъци и площадки",
  "ecomap-containers": "Контейнери за разделно събиране",
  "ecopack-containers": "Контейнери за разделно събиране · ЕКОПАК",
  "ecomap-collection-events": "Мобилни пунктове · публикуван календар",
  "plovdiv-eco-signals": "Къде да подадем сигнал · общински контакти",
  "plovdiv-transport-signals": "Транспорт, светофари и осветление · телефони за сигнали",
  "plovdiv-theatre": "Програма на Драматичния театър",
  "plovdiv-opera": "Програма на Опера Пловдив",
  "club-code-upcoming": "Клубна програма",
  "plovdiv-youth-centre": "Предстоящи дейности · Младежки център",
  "epaygo-plovdiv-explicit": "Още събития в Пловдив",
  "plovdiv-dog-shelter": "Профили в общинския приют",
  "plovdiv-adoption-guide": "Как да осиновя куче?",
  "plovdiv-gallery-current": "Изложби в градската галерия",
  "plovdiv-contacts": "Община и районни администрации",
  "plovdiv-tax-notices": "Местни данъци · публикувани срокове",
  "plovdiv-taxes": "Общински каси · адреси и работно време",
  "plovdiv-auction-list": "Общински търгове · срокове от обявите",
  "plovdiv-public-consultations": "Отворени обществени консултации",
  "plovdiv-management-competitions": "Конкурси за управление · общински дружества",
  "plovdiv-housing": "Общински жилища · публикуван ред",
};
const SOURCE_TOPICS: Record<string, string> = {
  "balbok-plovdiv-campaigns": "Мобилни пунктове",
  "vivacom-plovdiv-parking": "Синя и зелена зона",
  "mall-plovdiv-parking": "Паркинги", "markovo-tepe-parking": "Паркинги",
  "elyug-planned-plovdiv-region": "Без ток",
  "plovdiv-community-air": "Въздухът в Пловдив",
  "plovdiv-low-emission-permit": "Пропуск за нискоемисионната зона",
  "dz-admission-calendar": "Образователен календар",
  "plovdiv-transit": "Билети и карти",
  "plovdiv-livetransport-gtfs": "Градски автобуси",
  "plovdiv-transit-documents": "Градски автобуси",
  "karat-plovdiv-sofia": "Междуградски автобуси",
  "plovdiv-airport-flights": "Извън града",
  "plovdiv-low-emission": "Влизане в центъра",
  "plovdiv-parking-rules": "Синя и зелена зона",
  "plovdiv-parking-operator": "Репатриране",
  "vik-outages": "Без вода",
  "evn-heating-outages": "Парно и топла вода",
  "plovdiv-council": "Общински съвет",
  "dz-vacancies": "Детски градини и ясли",
  "dz-institutions": "Училища и градини",
  "first-grade-vacancies": "Първи клас",
  "plovdiv-municipal-schools": "Училища и градини",
  "plovdiv-social-services": "Социални услуги",
  "chistota-bulky-waste": "Къде да изхвърля?",
  "ecomap-containers": "Чистота и сметосъбиране",
  "ecopack-containers": "Чистота и сметосъбиране",
  "ecomap-collection-events": "Мобилни пунктове",
  "plovdiv-eco-signals": "Къде да подам сигнал?",
  "plovdiv-transport-signals": "Къде да подам сигнал?",
  "plovdiv-theatre": "Театър",
  "plovdiv-opera": "Опера и балет",
  "club-code-upcoming": "Партита",
  "plovdiv-youth-centre": "Младежки инициативи",
  "epaygo-plovdiv-explicit": "Културен афиш",
  "plovdiv-dog-shelter": "Животни за осиновяване",
  "plovdiv-adoption-guide": "Как да осиновя?",
  "plovdiv-gallery-current": "Изложби",
  "plovdiv-contacts": "Контакти и приемно време",
  "plovdiv-tax-notices": "Местни данъци и такси",
  "plovdiv-taxes": "Местни данъци и такси",
  "plovdiv-auction-list": "Търгове и общински имоти",
  "plovdiv-management-competitions": "Работа в общината",
  "plovdiv-public-consultations": "Обществени обсъждания",
  "plovdiv-housing": "Общински жилища",
};

const checkedFormat = new Intl.DateTimeFormat("bg-BG", {
  day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Sofia",
});
const eventDateFormat = new Intl.DateTimeFormat("bg-BG", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Sofia" });
const eventTimeFormat = new Intl.DateTimeFormat("bg-BG", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Sofia" });

function value(fields: Record<string, string | number>, key: string): string {
  return String(fields[key] ?? "");
}

function clubStatus(fields: Record<string, string | number>): string {
  return nightEventStatusLabel({
    key: "", title: value(fields, "title"), startDate: value(fields, "startDate"),
    endDate: value(fields, "endDate"), place: value(fields, "place"), status: value(fields, "status"),
  }, new Date());
}

function flightStatus(status: string): string {
  return ({ Scheduled: "По разписание", Arrived: "Пристигнал", Departed: "Излетял", Delayed: "Закъснява", Cancelled: "Отменен", Canceled: "Отменен" } as Record<string, string>)[status] ?? status;
}

function ObservationItem({ sourceId, itemKey, fields, story, articles }: { sourceId: string; itemKey: string; fields: Record<string, string | number>; story: CityStory | null; articles: ArticleSummary[] }) {
  let content: React.ReactNode;
  if (["plovdiv-parking-rules", "vivacom-plovdiv-parking"].includes(sourceId)) content = <><strong>{value(fields, "label")}</strong><p className="city-observed-value">{value(fields, "value")}</p><p>{value(fields, "detail")}</p></>;
  else if (sourceId === "plovdiv-parking-operator") content = <><strong>{value(fields, "label")}</strong>{fields.phone ? <p className="city-observed-value">{value(fields, "phone")}</p> : null}{fields.address ? <p className="city-observed-value">{value(fields, "address")}</p> : null}{fields.note ? <p>{value(fields, "note")}</p> : null}</>;
  else if (sourceId === "plovdiv-transit") content = <><strong>{value(fields, "label")}</strong><p className="city-observed-value">{value(fields, "price")}</p></>;
  else if (sourceId === "plovdiv-low-emission") content = <><strong>{value(fields, "label")}</strong><p className="city-observed-value">{value(fields, "value")}</p><details className="city-observed-detail"><summary>Формулировка от общината</summary><p>{value(fields, "detail")}</p></details></>;
  else if (sourceId === "plovdiv-livetransport-gtfs") content = <><strong>Линия {value(fields, "line")}</strong>{value(fields, "name") !== `Линия ${value(fields, "line")}` ? <p>{value(fields, "name")}</p> : null}<dl><div><dt>Посочени посоки</dt><dd>{value(fields, "destinations")}</dd></div><div><dt>За дата</dt><dd>{value(fields, "serviceDate")}</dd></div></dl></>;
  else if (sourceId === "plovdiv-airport-flights") content = <><strong>{fields.direction === "arrival" ? "Пристигащ" : "Заминаващ"} полет {value(fields, "flight")}</strong><p className="city-observed-value">{eventDateFormat.format(new Date(`${value(fields, "date")}T12:00:00Z`))} · {value(fields, "time")}</p><dl><div><dt>{fields.direction === "arrival" ? "От" : "За"}</dt><dd>{value(fields, "route")}</dd></div><div><dt>Статус</dt><dd>{flightStatus(value(fields, "status"))}</dd></div>{fields.note ? <div><dt>Уточнение</dt><dd>{value(fields, "note")}</dd></div> : null}</dl></>;
  else if (sourceId === "vik-outages") content = <><strong>{value(fields, "place")}</strong><p>{value(fields, "kind")}</p><dl><div><dt>Засегнати</dt><dd>{value(fields, "affected")}</dd></div><div><dt>Посочено време</dt><dd>{value(fields, "restoration")}</dd></div></dl></>;
  else if (sourceId === "elyug-planned-plovdiv-region") content = <><strong>{value(fields, "address")}</strong><p>Планирано изключване</p><dl><div><dt>От</dt><dd>{eventDateFormat.format(new Date(`${value(fields, "startDate")}T12:00:00Z`))} · {value(fields, "startTime")}</dd></div><div><dt>До</dt><dd>{eventDateFormat.format(new Date(`${value(fields, "endDate")}T12:00:00Z`))} · {value(fields, "endTime")}</dd></div></dl></>;
  else if (sourceId === "evn-heating-outages") content = <><strong>{value(fields, "address")}</strong><p>{value(fields, "issue")}</p><dl><div><dt>Вид</dt><dd>{fields.kind === "planned" ? "Планирано прекъсване" : "Повреда"}</dd></div><div><dt>От</dt><dd>{value(fields, "start")}</dd></div><div><dt>Публикувано до</dt><dd>{value(fields, "end")}</dd></div><div><dt>Посочен срок</dt><dd>{value(fields, "deadline")}</dd></div></dl></>;
  else if (sourceId === "dz-vacancies") content = <><strong>{value(fields, "school")}</strong><p>{value(fields, "ageGroup")}</p><dl><div><dt>Публикувани места</dt><dd>{value(fields, "total")}</dd></div><div><dt>Класиране</dt><dd>{value(fields, "rankingId")}</dd></div></dl></>;
  else if (sourceId === "first-grade-vacancies") content = <><strong>{value(fields, "school")}</strong><p>{value(fields, "district")} · {value(fields, "schoolType")}</p><dl><div><dt>Публикувани места</dt><dd>{value(fields, "places")}</dd></div><div><dt>От тях със СОП</dt><dd>{value(fields, "sopPlaces")}</dd></div><div><dt>Паралелки с места</dt><dd>{value(fields, "classes")}</dd></div><div><dt>Класиране</dt><dd>{value(fields, "ranking")} · {value(fields, "year")}</dd></div></dl></>;
  else if (sourceId === "plovdiv-municipal-schools") content = <><strong>{value(fields, "name")}</strong><p>{value(fields, "type")} · район {value(fields, "district")}</p><dl><div><dt>Адрес</dt><dd>{value(fields, "address")}</dd></div><div><dt>Публикуван телефон</dt><dd>{value(fields, "phone")}</dd></div></dl></>;
  else if (sourceId === "chistota-bulky-waste") content = fields.kind === "pickup" ? <><strong>{value(fields, "label")}</strong><dl><div><dt>Телефон за заявка</dt><dd>{value(fields, "phone")}</dd></div><div><dt>Публикувано</dt><dd>{value(fields, "published")}</dd></div></dl><details className="city-observed-detail"><summary>Условия за извозване</summary><p>{value(fields, "instruction")}</p><p>{value(fields, "exclusions")}</p></details></> : <><strong>{value(fields, "label")}</strong><dl><div><dt>Адрес</dt><dd>{value(fields, "address")}</dd></div><div><dt>Посещение и контакт</dt><dd>{value(fields, "contact")}</dd></div><div><dt>Публикувано</dt><dd>{value(fields, "published")}</dd></div></dl><details className="city-observed-detail"><summary>Посочени отпадъци</summary><p>{value(fields, "accepted")}</p></details></>;
  else if (sourceId === "balbok-plovdiv-campaigns") content = <><strong>{value(fields, "title")}</strong><p className="city-observed-value">{eventDateFormat.format(new Date(`${value(fields, "date")}T12:00:00Z`))} · {value(fields, "startTime")}–{value(fields, "endTime")}</p>{fields.status !== "scheduled" ? <p role="status">{fields.status === "cancelled" ? "Отменена кампания" : "Отложена кампания"}</p> : null}<p>{value(fields, "address")}</p><p><strong>Приемат се:</strong> {value(fields, "accepted")}</p></>;
  else if (sourceId === "ecomap-collection-events") content = <><strong>{value(fields, "title")}</strong><p className="city-observed-value">{eventDateFormat.format(new Date(`${value(fields, "date")}T12:00:00Z`))}</p><p>{value(fields, "details")}</p></>;
  else if (sourceId === "plovdiv-eco-signals" || sourceId === "plovdiv-transport-signals") content = <><strong>{value(fields, "label")}</strong><p>{value(fields, "reason")}</p><p className="city-observed-value">{value(fields, "phone")}</p></>;
  else if (sourceId === "plovdiv-council") content = <><strong>Точка {value(fields, "docket")}</strong><p>Публикувана в дневния ред; това не е прието решение.</p></>;
  else if (sourceId === "plovdiv-opera") content = <><strong>{value(fields, "title")}</strong><p>{eventDateFormat.format(new Date(`${value(fields, "date")}T12:00:00Z`))} · {value(fields, "time")}</p><dl><div><dt>Място</dt><dd>{value(fields, "location")}</dd></div></dl></>;
  else if (sourceId === "plovdiv-theatre") content = <><strong>{value(fields, "title")}</strong><p>{value(fields, "dateTime")}</p></>;
  else if (sourceId === "epaygo-plovdiv-explicit") content = <><strong>{value(fields, "title")}</strong><p>{eventDateFormat.format(new Date(`${value(fields, "date")}T12:00:00Z`))} · {value(fields, "time")}</p><dl><div><dt>Място</dt><dd>{value(fields, "place")}</dd></div><div><dt>Адрес</dt><dd>{value(fields, "address")}</dd></div></dl></>;
  else if (sourceId === "club-code-upcoming") content = <><strong>{value(fields, "title")}</strong><p>{eventDateFormat.format(new Date(value(fields, "startDate")))} · {eventTimeFormat.format(new Date(value(fields, "startDate")))}</p><dl><div><dt>Място</dt><dd>{value(fields, "place")}</dd></div>{fields.price ? <div><dt>Посочена цена</dt><dd>{value(fields, "price")} евро</dd></div> : null}<div><dt>Статус</dt><dd>{clubStatus(fields)}</dd></div></dl></>;
  else if (sourceId === "plovdiv-youth-centre") content = <><strong>{value(fields, "title")}</strong><p className="city-observed-value">{eventDateFormat.format(new Date(`${value(fields, "date")}T12:00:00Z`))}{fields.endDate !== fields.date ? ` – ${eventDateFormat.format(new Date(`${value(fields, "endDate")}T12:00:00Z`))}` : ""}{fields.time ? ` · ${value(fields, "time")}` : ""}</p><dl><div><dt>Място</dt><dd>{value(fields, "place")}</dd></div></dl></>;
  else if (sourceId === "plovdiv-dog-shelter") content = <><strong>Профил №{value(fields, "dogId")}</strong><p>{value(fields, "description")}</p><dl><div><dt>Порода</dt><dd>{value(fields, "breed")}</dd></div><div><dt>Пол</dt><dd>{value(fields, "sex")}</dd></div><div><dt>Размер</dt><dd>{value(fields, "size")}</dd></div><div><dt>Цвят</dt><dd>{value(fields, "color")}</dd></div></dl></>;
  else if (sourceId === "plovdiv-adoption-guide") content = <><strong>{value(fields, "label")}</strong><p>{value(fields, "detail")}</p></>;
  else if (sourceId === "plovdiv-gallery-current") content = <><strong>{value(fields, "title")}</strong><p>{eventDateFormat.format(new Date(`${value(fields, "startDate")}T12:00:00Z`))} – {eventDateFormat.format(new Date(`${value(fields, "endDate")}T12:00:00Z`))}</p><dl><div><dt>Зала</dt><dd>{value(fields, "venue")}</dd></div></dl></>;
  else if (sourceId === "plovdiv-contacts") content = <><strong>{value(fields, "label")}</strong><dl><div><dt>Адрес</dt><dd>{value(fields, "address")}</dd></div>{fields.phone ? <div><dt>Телефони</dt><dd>{value(fields, "phone")} · {value(fields, "secondPhone")}</dd></div> : null}</dl></>;
  else if (sourceId === "plovdiv-tax-notices") content = <><strong>{value(fields, "label")}</strong><p className="city-observed-value">До {eventDateFormat.format(new Date(`${value(fields, "dueDate")}T12:00:00Z`))}</p></>;
  else if (sourceId === "plovdiv-auction-list") content = <><strong>{value(fields, "title")}</strong><dl><div><dt>Документи до</dt><dd>{eventDateFormat.format(new Date(`${value(fields, "deadline")}T12:00:00Z`))}</dd></div><div><dt>Търг на</dt><dd>{eventDateFormat.format(new Date(`${value(fields, "auctionDate")}T12:00:00Z`))}</dd></div><div><dt>Обявено</dt><dd>{eventDateFormat.format(new Date(`${value(fields, "published")}T12:00:00Z`))}</dd></div></dl></>;
  else if (sourceId === "plovdiv-management-competitions") content = <><strong>{value(fields, "company")}</strong><p>Конкурс за управление</p><p className="city-observed-value">Кандидатстване до {eventDateFormat.format(new Date(`${value(fields, "deadline")}T12:00:00Z`))} · {value(fields, "time")}</p><dl><div><dt>Подаване на документи</dt><dd>{value(fields, "place")}</dd></div><div><dt>Обявено</dt><dd>{eventDateFormat.format(new Date(`${value(fields, "published")}T12:00:00Z`))}</dd></div></dl></>;
  else if (sourceId === "plovdiv-public-consultations") content = <><strong>{value(fields, "title")}</strong><p className="city-observed-value">Становища до {eventDateFormat.format(new Date(`${value(fields, "deadline")}T12:00:00Z`))}</p><dl><div><dt>Открита</dt><dd>{eventDateFormat.format(new Date(`${value(fields, "opened")}T12:00:00Z`))}</dd></div><div><dt>Номер</dt><dd>{value(fields, "number")}</dd></div><div><dt>Посочен имейл</dt><dd>{value(fields, "email")}</dd></div></dl><details className="city-observed-detail"><summary>Начини за изпращане на становище</summary>{value(fields, "ways").split("\n").map((way, index) => <p key={index}>{way}</p>)}</details></>;
  else if (sourceId === "plovdiv-housing") content = <><strong>{value(fields, "title")}</strong><p>{value(fields, "intro")}</p><details className="city-observed-detail"><summary>Условия и ред за кандидатстване</summary>{value(fields, "body").split("\n").slice(1).map((paragraph, index) => <p key={index}>{paragraph}</p>)}</details></>;
  else if (sourceId === "plovdiv-taxes") content = <><strong>{value(fields, "label")}</strong><dl><div><dt>Адрес</dt><dd>{value(fields, "address")}</dd></div><div><dt>Публикувано работно време</dt><dd>{value(fields, "hours")}</dd></div></dl></>;
  else return null;
  return <article className="city-observed-item" id={`city-record-${sourceId}-${itemKey}`}>{content}</article>;
}

function ObservationGroup({ group, story, articles }: { group: CityObservation; story: CityStory | null; articles: ArticleSummary[] }) {
  const meta = CITY_PRESENTATION[group.sourceId];
  const name = meta?.title ?? SOURCE_NAMES[group.sourceId] ?? 'Справка';
  return <article className="city-observed-group" id={`nablyudavani-${group.sourceId}`} data-source={group.sourceId}>
    <div className="city-observed-group-head"><div><p className="city-panel-eyebrow">{meta?.utility ? 'ПОЛЕЗЕН КОНТАКТ' : 'В ТВОЯ ГРАД'}</p><h3>{name}</h3><p className="city-panel-description">{meta?.description}</p></div>{!["mall-plovdiv-parking", "markovo-tepe-parking", "karat-plovdiv-sofia", "plovdiv-transit-documents"].includes(group.sourceId) ? <span className="city-panel-total" title="Брой записи в тази справка">{group.items.length}</span> : null}</div>
    {group.sourceId === "plovdiv-transit-documents" ? <CityTransitDocuments documents={group.status === "observed" ? group.items.flatMap(item => { const document = cityTransitDocument(item.fields); return document ? [{ ...document, key: item.key }] : []; }) : []} /> : ['mall-plovdiv-parking', 'markovo-tepe-parking'].includes(group.sourceId) ? <CityParkingVenue group={group} /> : group.sourceId === 'plovdiv-community-air' ? <CityAirQuality items={group.items} /> : group.sourceId === 'plovdiv-low-emission-permit' ? <CityLowEmissionPermit group={group} /> : group.sourceId === 'dz-admission-calendar' ? <CityAdmissionCalendar group={group} /> : group.sourceId === 'plovdiv-livetransport-gtfs' ? <CityTransitTimetable lines={group.items.map(item => ({ key: item.key, line: String(item.fields.line), destinations: String(item.fields.destinations) }))} checkedAt={group.checkedAt} news={Object.fromEntries(group.items.map(item => [item.key, cityTransitLineStories(String(item.fields.line), articles)]))} /> : MUNICIPAL_RECORD_SOURCES.has(group.sourceId) ? <CityMunicipalRecords group={group} topicStories={cityTopicStories([SOURCE_TOPICS[group.sourceId] ?? ""], articles)} news={Object.fromEntries(group.items.map(item => [item.key, cityRecordStories(SOURCE_TOPICS[group.sourceId] ?? "", String(item.fields.company ?? item.fields.title ?? item.fields.label ?? ""), articles)]))} /> : group.sourceId === 'plovdiv-dog-shelter' ? <CityDogGallery items={group.items} story={story} /> : group.sourceId === 'plovdiv-social-services' ? <CitySocialServices items={group.items} /> : group.sourceId === 'plovdiv-municipal-schools' ? <CitySchoolDirectory items={group.items} /> : group.sourceId === 'dz-institutions' ? <CitySchoolDirectory items={group.items} kind="childcare" /> : ["ecomap-containers", "ecopack-containers"].includes(group.sourceId) ? <CityEcoPoints items={group.items} /> : <>
      <div className="city-observed-grid">{group.items.slice(0, 8).map(item => <ObservationItem key={item.key} sourceId={group.sourceId} itemKey={item.key} fields={item.fields} story={story} articles={articles} />)}</div>
      {group.items.length > 8 ? <details className="city-observed-more"><summary>Покажи още {group.items.length - 8}</summary><div className="city-observed-grid">{group.items.slice(8).map(item => <ObservationItem key={item.key} sourceId={group.sourceId} itemKey={item.key} fields={item.fields} story={story} articles={articles} />)}</div></details> : null}
    </>}
    <div className="city-panel-footer"><time dateTime={group.checkedAt}>{group.status === "observed" ? "Обновено" : "Последна проверка"} {checkedFormat.format(new Date(group.checkedAt))}</time><details className="city-data-note"><summary>Какво обхваща справката?</summary><p>{meta?.note ?? 'Виж датата на обновяване на справката.'}</p></details></div>
  </article>;
}

export function CityObservedData({ categorySlug, groups, stories, articles, extraSections = [] }: { extraSections?: CityWorkspaceSection[]; categorySlug: string; groups: CityObservation[]; stories: Record<string, CityStory | null>; articles: ArticleSummary[] }) {
  const visible = readerCityGroups(groups).filter(group => !cityIntercityRoute(group.sourceId));
  const intercity: CityWorkspaceSection | null = categorySlug === "transport" ? {
    id: "intercity-buses", title: "Междуградски автобуси", description: "Избери дестинация и дата за публикуваните курсове от Пловдив.", utility: false, count: 0,
    content: <article className="city-observed-group" id="nablyudavani-intercity-buses">
      <div className="city-observed-group-head"><div><h3>Междуградски автобуси</h3><p className="city-panel-description">Дестинация, дата и точна спирка на тръгване.</p></div></div>
      <CityIntercityTimetable sources={cityIntercitySources(groups)} />
      <CityRelatedNews topic="Междуградски автобуси" stories={cityTopicStories(["Междуградски автобуси"], articles)} />
    </article>,
  } : null;
  if (!visible.length && !extraSections.length && !intercity) return <section className="city-empty" role="status"><h2>Справката временно не е достъпна.</h2><p>Опитай отново след малко.</p></section>;
  const sections: CityWorkspaceSection[] = visible.map(group => {
    const meta = CITY_PRESENTATION[group.sourceId];
    return { id: group.sourceId, title: meta?.title ?? SOURCE_NAMES[group.sourceId] ?? 'Справка', description: meta?.description ?? '', utility: !!meta?.utility, count: group.items.length, content: <><ObservationGroup group={group} story={stories[categorySlug === 'municipality' && group.sourceId === 'plovdiv-eco-signals' ? 'Къде да подам сигнал?' : SOURCE_TOPICS[group.sourceId] ?? ''] ?? null} articles={articles} />{group.sourceId !== "plovdiv-livetransport-gtfs" && !MUNICIPAL_RECORD_SOURCES.has(group.sourceId) ? <CityRelatedNews topic={meta?.title ?? SOURCE_TOPICS[group.sourceId] ?? "Градът в новините"} stories={["mall-plovdiv-parking", "markovo-tepe-parking"].includes(group.sourceId) ? cityParkingVenueStories(group.sourceId, articles) : cityTopicStories([SOURCE_TOPICS[group.sourceId] ?? ""], articles)} /> : null}</> };
  });
  if (intercity) sections.splice(visible.filter(group => (CITY_PRESENTATION[group.sourceId]?.order ?? 20) < 3).length, 0, intercity);
  return <CityWorkspace sections={[...sections, ...extraSections]} />;
}
