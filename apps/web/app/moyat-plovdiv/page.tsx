import { cityGuideEnabled } from "@/lib/city-guide/access";
import { notFound } from "next/navigation";
import { CityGuideHome } from "@/components/city-guide/city-guide";
import { CityHomeHighlights } from "@/components/city-guide/city-home-highlights";
import { CityLocalNav } from "@/components/city-guide/city-local-nav";
import { CITY_CATEGORIES } from "@/lib/city-guide/catalog";
import { loadCityObservations } from "@/lib/city-guide/local-observations";
import { cityAvailableTopics } from "@/lib/city-guide/topic-coverage";
import { cityStoryForCategory, cityTopicStories, type CityStory } from "@/lib/city-guide/news";
import { loadCityArticlePool } from "@/lib/city-guide/news-server";
import { cityPageMetadata, cityPageGraph, citySeoPage } from "@/lib/city-guide/seo";
import { JsonLd } from "@/components/json-ld";
import { CitySearchContext } from "@/components/city-guide/city-search-context";

export function generateMetadata() { if (!cityGuideEnabled()) notFound(); return cityPageMetadata(); }

export default async function CityGuidePage() {
  if (!cityGuideEnabled()) notFound();
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
  const searchItems = availableSlugs.flatMap(slug => { const page = citySeoPage(slug); return page ? [page] : []; });
  return <><JsonLd data={cityPageGraph(undefined, searchItems)} /><CityLocalNav availableSlugs={availableSlugs} /><CityGuideHome availableSlugs={availableSlugs} activeTopicsByCategory={activeTopicsByCategory} topicHrefByCategory={topicHrefByCategory} newsByCategory={newsByCategory} featuredStories={featuredStories} today={<CityHomeHighlights groups={[...transport, ...outages, ...parking, ...municipality, ...education, ...environment]} culture={culture} nightlife={nightlife} />} /><CitySearchContext availableSlugs={availableSlugs} /></>;
}
