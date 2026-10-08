import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { getStoryThemeBySlug } from "@/lib/queries";
import { StoryTimeline } from "@/components/story-timeline";
import { publicMetadata } from "@/lib/public-metadata";
import { storyThemeRedirect } from "@/lib/story-theme-redirect";
import { JsonLd } from "@/components/json-ld";
import { breadcrumbList, collectionPage } from "@/lib/jsonld";
import { shareOrigin } from "@/lib/share-card";

export const revalidate = 60;

async function resolveTheme(slug: string) {
  const theme = await getStoryThemeBySlug(slug);
  if (theme) return theme;
  const destination = await storyThemeRedirect(slug);
  if (destination) permanentRedirect(destination);
  notFound();
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const theme = await resolveTheme(slug);
  return publicMetadata({
    path: `/temi/${theme.slug}/`,
    title: theme.title,
    description: theme.summary || `Хронология на темата „${theme.title}".`,
    imagePath: `/share/theme/${theme.slug}/`,
  });
}

export default async function StoryThemePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const theme = await resolveTheme(slug);
  const origin = shareOrigin();
  return <>
    <JsonLd id="np-ld-theme" data={[
      breadcrumbList(origin, [{ name: "Начало", path: "/" }, { name: "Теми с продължение", path: "/temi/" }, { name: theme.title }]),
      collectionPage({ origin, path: `/temi/${theme.slug}/`, title: theme.title, description: theme.summary || `Хронология на темата „${theme.title}".`, items: theme.articles.map((article) => ({ path: article.path, title: article.title })) }),
    ]} />
    <StoryTimeline theme={theme} />
  </>;
}
