import type { Metadata } from "next";
import { CITY_DEFERRED_CATEGORIES } from "@newspoint/content/city-sources";
import { CITY_CATEGORIES } from "./catalog";
import type { CityObservation } from "./local-observations";
import { cityAgenda } from "./event-agenda";
import { publicMetadata, SITE_OG_IMAGE } from "../public-metadata";
import { publicRobotsMetadata } from "../indexing-policy.mjs";
import { breadcrumbList, collectionPage } from "../jsonld";
import { shareOrigin } from "../share-card";

export const CITY_HOME_SEO = { path: "/moyat-plovdiv/", title: "Моят Пловдив – транспорт, справки и събития", description: "Практичният справочник на NewsPoint за Пловдив: автобуси, паркиране, аварии, образование и афиш. Избери тема и провери наличните данни и времето на получаването им." };
const descriptions: Record<string, { title: string; description: string }> = {
  transport: { title: "Автобуси и транспорт в Пловдив – разписания и движение", description: "Градски линии, спирки и планирани разписания в Пловдив, публикувани междуградски курсове и ограничения по улиците. Проверявай посоката и датата на справката." },
  parking: { title: "Паркиране в Пловдив – зони, паркинги и условия", description: "Справки за паркиране в Пловдив: публикувани тарифи, работно време и условия от наличните източници. Без обещание за свободни места в реално време." },
  outages: { title: "Аварии в Пловдив – без вода, ток и топлоподаване", description: "Публикувани аварии и планирани прекъсвания в Пловдив. Провери засегнатите адреси, периода и времето на получаване на информацията от съответния оператор." },
  education: { title: "Образование в Пловдив – училища, прием и срокове", description: "Училища, прием и образователни справки за Пловдив. Намери наличните официални данни по тема и провери за коя учебна година и период се отнасят." },
  environment: { title: "Градска среда в Пловдив – въздух и отпадъци", description: "Справки за въздуха, разделното събиране и градската среда в Пловдив. Налични измервания, адреси и кампании с посочен произход и време на данните." },
  culture: { title: "Културна програма в Пловдив – театър, опера и изложби", description: "Афиш на Пловдив с театрални постановки, опера, изложби и други културни събития. Избери дата или място и прочети публикуваните подробности за събитието." },
  nightlife: { title: "Нощен Пловдив – концерти, партита и куизове", description: "Програма за вечерите в Пловдив: концерти, музика на живо, партита, стендъп и куизове според наличния афиш. Дати, места и подробности за отделните събития." },
  municipality: { title: "Община Пловдив – институции и публични справки", description: "Налични справки за общински услуги и институции в Пловдив. Информация се показва само когато има достъпен и приет източник." },
  adopt: { title: "Осиновяване на животни в Пловдив", description: "Публикувани профили и информация за осиновяване в Пловдив, когато са налични от приет източник. Наличността се потвърждава с приюта." },
};

export function citySeoPage(slug?: string) {
  if (!slug) return CITY_HOME_SEO;
  if (!CITY_CATEGORIES.some(category => category.slug === slug) || CITY_DEFERRED_CATEGORIES.includes(slug)) return null;
  const entry = descriptions[slug];
  return entry ? { ...entry, path: `/moyat-plovdiv/${slug}/` } : null;
}

/** Fresh, approved data only; an observed empty outage list is still a useful report. */
export function cityHasSearchContent(slug: string, groups: CityObservation[], today?: string): boolean {
  if (!citySeoPage(slug)) return false;
  if (slug === "culture" || slug === "nightlife") return cityAgenda(groups, slug, today).length > 0;
  return groups.some(group => group.status === "observed" && (group.items.length > 0 || (slug === "outages" && group.completeness === "complete")));
}

export function cityPageMetadata(slug?: string, hasContent = true): Metadata {
  const page = citySeoPage(slug);
  if (!page) return { robots: { index: false, follow: false } };
  const robots = publicRobotsMetadata();
  return { ...publicMetadata({ ...page, imagePath: SITE_OG_IMAGE }), robots: { ...robots, index: robots.index && hasContent } };
}

export function cityPageGraph(slug: string | undefined, items: { path: string; title: string }[]) {
  const page = citySeoPage(slug);
  if (!page) return [];
  const origin = shareOrigin();
  const breadcrumbs = [{ name: "NewsPoint.bg", path: "/" }, { name: "Моят Пловдив", path: CITY_HOME_SEO.path }];
  if (slug) breadcrumbs.push({ name: CITY_CATEGORIES.find(category => category.slug === slug)!.title, path: page.path });
  return [
    { ...collectionPage({ origin, ...page, items }), publisher: { "@id": `${origin}/#organization` }, spatialCoverage: { "@type": "City", name: "Пловдив" } },
    breadcrumbList(origin, breadcrumbs),
  ];
}
