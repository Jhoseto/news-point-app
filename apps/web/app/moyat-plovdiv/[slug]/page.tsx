import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CityCategoryView, CityOutagesView, CityOutView, CityParkingView, CityTransportView } from "@/components/city-guide/city-guide";
import { CityObservedData } from "@/components/city-guide/city-observations";
import { CityLocalNav } from "@/components/city-guide/city-local-nav";
import { CITY_CATEGORIES } from "@/lib/city-guide/catalog";
import { loadCityObservations } from "@/lib/city-guide/local-observations";
import { cityAvailableTopics } from "@/lib/city-guide/topic-coverage";
import { cityOutStories, cityStoriesForTopics } from "@/lib/city-guide/news";
import { loadCityArticlePool } from "@/lib/city-guide/news-server";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const category = CITY_CATEGORIES.find(item => item.slug === slug);
  return { title: category ? `${category.title} — Моят Пловдив` : "Моят Пловдив", robots: { index: false, follow: false } };
}

export default async function CityCategoryPage({ params }: Props) {
  if (process.env.NODE_ENV !== "development") notFound();
  const { slug } = await params;
  const category = CITY_CATEGORIES.find(item => item.slug === slug);
  if (!category) notFound();
  const [articles, observationGroups, categoryGroups] = await Promise.all([
    loadCityArticlePool(),
    loadCityObservations(slug),
    Promise.all(CITY_CATEGORIES.map(async entry => ({ slug: entry.slug, groups: await loadCityObservations(entry.slug) }))),
  ]);
  const activeGroups = observationGroups.filter(group => group.status === "observed" && group.items.length > 0);
  const availableTopics = cityAvailableTopics(slug, activeGroups);
  const stories = cityStoriesForTopics(availableTopics.map(topic => topic.title), articles);
  const observations = <CityObservedData categorySlug={slug} groups={activeGroups} stories={stories} articles={articles} />;
  const availableSlugs = categoryGroups.filter(entry => cityAvailableTopics(entry.slug, entry.groups).length > 0).map(entry => entry.slug);
  const withNav = (content: React.ReactNode) => <><CityLocalNav currentSlug={slug} availableSlugs={availableSlugs} topics={availableTopics} />{content}</>;
  if (slug === "nightlife") {
    const club = observationGroups.find(group => group.sourceId === "club-code-upcoming");
    const events = club?.status === "observed" ? club.items.map(item => ({
      key: item.key,
      title: String(item.fields.title),
      startDate: String(item.fields.startDate),
      endDate: String(item.fields.endDate),
      place: String(item.fields.place),
      status: String(item.fields.status),
      ...(typeof item.fields.price === "number" ? { price: item.fields.price } : {}),
    })) : [];
    const otherGroups = activeGroups.filter(group => group.sourceId !== "club-code-upcoming");
    const outObservations = otherGroups.length ? <CityObservedData categorySlug={slug} groups={otherGroups} stories={stories} articles={articles} /> : events.length ? null : observations;
    return withNav(<CityOutView stories={cityOutStories(articles)} observations={outObservations} events={events} {...(club?.checkedAt ? { checkedAt: club.checkedAt } : {})} nowIso={new Date().toISOString()} />);
  }
  if (slug === "outages") return withNav(<CityOutagesView category={category} stories={stories} observations={observations} />);
  if (slug === "transport") return withNav(<CityTransportView category={category} stories={stories} observations={observations} activeTopics={availableTopics.map(topic => topic.title)} hasFareData={activeGroups.some(group => group.sourceId === "plovdiv-transit")} hasRouteData={activeGroups.some(group => group.sourceId === "plovdiv-livetransport-gtfs")} />);
  if (slug === "parking") return withNav(<CityParkingView category={category} stories={stories} observations={observations} hasObservedData={activeGroups.length > 0} />);
  return withNav(<CityCategoryView category={category} stories={stories} observations={observations} />);
}
