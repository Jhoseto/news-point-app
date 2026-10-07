import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getStoryThemeBySlug } from "@/lib/queries";
import { StoryTimeline } from "@/components/story-timeline";

export const revalidate = 60;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const theme = await getStoryThemeBySlug(slug);
  if (!theme) return { title: "Тема" };
  return {
    title: theme.title,
    description: theme.summary || `Хронология на темата „${theme.title}".`,
  };
}

export default async function StoryThemePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const theme = await getStoryThemeBySlug(slug);
  if (!theme) notFound();
  return <StoryTimeline theme={theme} />;
}
