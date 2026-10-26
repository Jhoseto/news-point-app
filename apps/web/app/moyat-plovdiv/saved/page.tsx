import { notFound } from "next/navigation";
import { cityGuideEnabled } from "@/lib/city-guide/access";
import { loadCityObservations } from "@/lib/city-guide/local-observations";
import { cityAvailableTopics } from "@/lib/city-guide/topic-coverage";
import { CITY_CATEGORIES } from "@/lib/city-guide/catalog";
import { cityAgenda } from "@/lib/city-guide/event-agenda";
import { CityLocalNav } from "@/components/city-guide/city-local-nav";
import { CitySavedEvents } from "@/components/city-guide/city-saved-events";

export const metadata = { title: "Запазени — Моят Пловдив", robots: { index: false, follow: false } };
export default async function SavedCityPage() {
  if (!cityGuideEnabled()) notFound();
  const groups = await Promise.all(CITY_CATEGORIES.map(async category => ({ slug: category.slug, groups: await loadCityObservations(category.slug) })));
  const availableSlugs = groups.filter(entry => cityAvailableTopics(entry.slug, entry.groups).length).map(entry => entry.slug);
  const events = (["culture", "nightlife"] as const).flatMap(category => cityAgenda(groups.find(entry => entry.slug === category)?.groups ?? [], category).map(event => ({ ...event, category }))).sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
  return <><CityLocalNav currentSlug="saved" availableSlugs={availableSlugs} /><CitySavedEvents events={events} /></>;
}
