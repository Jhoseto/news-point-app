import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CityGuideHome } from "@/components/city-guide/city-guide";
import { CITY_CATEGORIES } from "@/lib/city-guide/catalog";
import { cityStoryForCategory, type CityStory } from "@/lib/city-guide/news";
import { loadCityArticlePool } from "@/lib/city-guide/news-server";

export const metadata: Metadata = {
  title: "Моят Пловдив — визуален преглед",
  robots: { index: false, follow: false },
};

export default async function CityGuidePage() {
  if (process.env.NODE_ENV !== "development") notFound();
  const articles = await loadCityArticlePool();
  const newsByCategory: Record<string, CityStory | null> = {};
  for (const category of CITY_CATEGORIES) {
    newsByCategory[category.slug] = cityStoryForCategory(category.topics.map(topic => topic.title), articles);
  }
  const featuredOrder = ["transport", "parking", "environment", "outages", "culture", "education", "municipality", "adopt"];
  const featuredStories = [...new Map(featuredOrder.map(slug => newsByCategory[slug]).filter((story): story is CityStory => !!story)
    .map(story => [story.path, story])).values()].slice(0, 3);
  return <CityGuideHome newsByCategory={newsByCategory} featuredStories={featuredStories} />;
}
