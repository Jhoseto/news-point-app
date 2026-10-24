import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CityCategoryView, CityOutagesView, CityOutView, CityParkingView, CityTransportView } from "@/components/city-guide/city-guide";
import { CITY_CATEGORIES } from "@/lib/city-guide/catalog";
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
  const articles = await loadCityArticlePool();
  if (slug === "nightlife") return <CityOutView stories={cityOutStories(articles)} />;
  const stories = cityStoriesForTopics(category.topics.map(topic => topic.title), articles);
  if (slug === "outages") return <CityOutagesView category={category} stories={stories} />;
  if (slug === "transport") return <CityTransportView category={category} stories={stories} />;
  if (slug === "parking") return <CityParkingView category={category} stories={stories} />;
  return <CityCategoryView category={category} stories={stories} />;
}
