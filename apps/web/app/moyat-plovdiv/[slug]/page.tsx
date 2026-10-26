import { CityRoadRestrictions } from "@/components/city-guide/city-road-restrictions";
import { isTomTomConfigured } from "@/lib/livepoint/config";
import { cityGuideEnabled } from "@/lib/city-guide/access";
import { CITY_DEFERRED_CATEGORIES } from "@newspoint/content/city-sources";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CityCategoryView, CityOutagesView, CityParkingView, CityTransportView } from "@/components/city-guide/city-guide";
import { CityObservedData } from "@/components/city-guide/city-observations";
import { CityLocalNav } from "@/components/city-guide/city-local-nav";
import { CITY_CATEGORIES } from "@/lib/city-guide/catalog";
import { loadCityObservations } from "@/lib/city-guide/local-observations";
import { cityAvailableTopics } from "@/lib/city-guide/topic-coverage";
import { cityAgendaStories, cityAgendaContextStories, cityStoriesForTopics, cityTopicStories } from "@/lib/city-guide/news";
import { loadCityArticlePool } from "@/lib/city-guide/news-server";

import { CityEventAgenda } from "@/components/city-guide/city-event-agenda";
import { cityAgenda, AGENDA_KINDS, AGENDA_EXTRA_FILTERS, agendaExtraMatches, type AgendaKind, type AgendaExtra } from "@/lib/city-guide/event-agenda";
type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  if (CITY_DEFERRED_CATEGORIES.includes(slug)) notFound();
  const category = CITY_CATEGORIES.find(item => item.slug === slug);
  return { title: category ? `${category.title} — Моят Пловдив` : "Моят Пловдив", robots: { index: false, follow: false } };
}

export default async function CityCategoryPage({ params }: Props) {
  if (!cityGuideEnabled()) notFound();
  const { slug } = await params;
  const category = CITY_CATEGORIES.find(item => item.slug === slug);
  if (!category || CITY_DEFERRED_CATEGORIES.includes(slug)) notFound();
  const [articles, observationGroups, categoryGroups] = await Promise.all([
    loadCityArticlePool(),
    loadCityObservations(slug),
    Promise.all(CITY_CATEGORIES.map(async entry => ({ slug: entry.slug, groups: await loadCityObservations(entry.slug) }))),
  ]);
  const activeGroups = observationGroups.filter(group => group.status === "observed" && group.items.length > 0);
  const roadEnabled = slug === "transport" && isTomTomConfigured();
  const availableTopics = [...cityAvailableTopics(slug, activeGroups), ...(roadEnabled ? [{ title: "Затворени улици", href: "#nablyudavani-livepoint-roads" }] : slug === "outages" && isTomTomConfigured() ? [{ title: "Улични ремонти", href: "/moyat-plovdiv/transport/#nablyudavani-livepoint-roads" }] : [])];
  const stories = cityStoriesForTopics(availableTopics.map(topic => topic.title), articles);
  const observations = <CityObservedData categorySlug={slug} groups={activeGroups} stories={stories} articles={articles} extraSections={roadEnabled ? [{ id: "livepoint-roads", title: "Затворени улици и ремонти", description: "Текущи ограничения и засегнати участъци с карта.", count: 0, utility: false, content: <CityRoadRestrictions stories={cityTopicStories(["Затворени улици", "Улични ремонти"], articles)} /> }] : []} />;
  const availableSlugs = categoryGroups.filter(entry => cityAvailableTopics(entry.slug, entry.groups).length > 0).map(entry => entry.slug);
  const withNav = (content: React.ReactNode) => <><CityLocalNav currentSlug={slug} availableSlugs={availableSlugs} topics={availableTopics} />{content}</>;
  if (slug === "nightlife" || slug === "culture") {
    const events = cityAgenda(activeGroups, slug);
    const kinds = [...new Set(events.map(event => event.kind))];
    const news = Object.fromEntries(["all", ...kinds].map(kind => [kind, cityAgendaStories(articles, kind === "all" ? kinds : [kind as AgendaKind])]));
    for (const place of new Set(events.map(event => event.place))) {
      for (const kind of ["all", ...kinds]) news[`place:${place}:${kind}`] = cityAgendaContextStories(articles, kind === "all" ? kinds : [kind as AgendaKind], { place });
    }
    for (const event of events) news['event:' + event.id] = cityAgendaContextStories(articles, [event.kind], { place: event.place, title: event.title });
    return <><CityLocalNav currentSlug={slug} availableSlugs={availableSlugs} topics={[...kinds.map(kind => ({ title: AGENDA_KINDS[kind], href: `#agenda-${kind}` })), ...(Object.keys(AGENDA_EXTRA_FILTERS) as AgendaExtra[]).filter(key => events.some(event => agendaExtraMatches(event, key))).map(key => ({ title: AGENDA_EXTRA_FILTERS[key], href: `#agenda-extra-${key}` }))]} /><CityEventAgenda category={slug} events={events} news={news} today={new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Sofia" })} /></>;
  }
  if (slug === "outages") return withNav(<CityOutagesView category={category} stories={stories} observations={observations} />);
  if (slug === "transport") return withNav(<CityTransportView category={category} stories={stories} observations={observations} activeTopics={availableTopics.map(topic => topic.title)} hasFareData={activeGroups.some(group => group.sourceId === "plovdiv-transit")} hasRouteData={activeGroups.some(group => group.sourceId === "plovdiv-livetransport-gtfs")} />);
  if (slug === "parking") return withNav(<CityParkingView category={category} stories={stories} observations={observations} hasObservedData={activeGroups.length > 0} />);
  return withNav(<CityCategoryView category={category} stories={stories} observations={observations} />);
}
