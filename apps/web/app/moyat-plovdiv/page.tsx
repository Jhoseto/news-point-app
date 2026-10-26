import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CityGuideHome } from "@/components/city-guide/city-guide";
import { CityHomeHighlights } from "@/components/city-guide/city-home-highlights";
import { CityLocalNav } from "@/components/city-guide/city-local-nav";
import { CITY_CATEGORIES } from "@/lib/city-guide/catalog";
import { loadCityObservations } from "@/lib/city-guide/local-observations";
import { cityAvailableTopics } from "@/lib/city-guide/topic-coverage";
import { cityStoryForCategory, cityTopicStories, type CityStory } from "@/lib/city-guide/news";
import { loadCityArticlePool } from "@/lib/city-guide/news-server";

export const metadata: Metadata = {
  title: "Моят Пловдив",
  robots: { index: false, follow: false },
};

export default async function CityGuidePage() {
  if (process.env.NODE_ENV !== "development") notFound();
  const [articles, transport, outages, parking, municipality, education, environment, culture, adoption, nightlife] = await Promise.all([
    loadCityArticlePool(),
    loadCityObservations("transport"),
    loadCityObservations("outages"),
    loadCityObservations("parking"),
    loadCityObservations("municipality"),
    loadCityObservations("education"),
    loadCityObservations("environment"),
    loadCityObservations("culture"),
    loadCityObservations("adopt"),
    loadCityObservations("nightlife"),
  ]);
  const newsByCategory: Record<string, CityStory | null> = {};
  const groupsByCategory = { transport, parking, outages, municipality, education, environment, culture, adopt: adoption, nightlife };
  const availableTopicsByCategory = Object.fromEntries(CITY_CATEGORIES.map(category => [category.slug, cityAvailableTopics(category.slug, groupsByCategory[category.slug as keyof typeof groupsByCategory])]));
  const activeTopicsByCategory = Object.fromEntries(CITY_CATEGORIES.map(category => [category.slug, (availableTopicsByCategory[category.slug] ?? []).map(topic => topic.title)]));
  const topicHrefByCategory = Object.fromEntries(CITY_CATEGORIES.map(category => [category.slug, Object.fromEntries((availableTopicsByCategory[category.slug] ?? []).map(topic => [topic.title, topic.href]))]));
  const availableSlugs = CITY_CATEGORIES.filter(category => activeTopicsByCategory[category.slug]?.length).map(category => category.slug);
  for (const category of CITY_CATEGORIES) {
    newsByCategory[category.slug] = cityStoryForCategory(activeTopicsByCategory[category.slug] ?? [], articles);
  }
  const featuredStories = cityTopicStories(Object.values(activeTopicsByCategory).flat(), articles, new Date(), 6).sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)).slice(0, 3);
  return <><CityLocalNav availableSlugs={availableSlugs} /><CityGuideHome availableSlugs={availableSlugs} activeTopicsByCategory={activeTopicsByCategory} topicHrefByCategory={topicHrefByCategory} newsByCategory={newsByCategory} featuredStories={featuredStories} today={<CityHomeHighlights groups={[...transport, ...outages, ...parking, ...municipality, ...education, ...environment]} culture={culture} nightlife={nightlife} />} /></>;
}
