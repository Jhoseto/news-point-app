import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PodcastPageShell } from "@/components/podcast/page-shell";
import { PodcastShow } from "@/components/podcast/show";
import { publicEpisode, publicEpisodes } from "@/lib/podcasts";

export const revalidate = 60;

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const episode = await publicEpisode((await params).slug);
  if (!episode) return {};
  return { title: `${episode.title} · NewsPodcast`, description: episode.summary };
}

export default async function PodcastEpisodePage({ params }: Props) {
  const slug = (await params).slug;
  const [episode, episodes] = await Promise.all([publicEpisode(slug), publicEpisodes()]);
  if (!episode) notFound();
  const ordered = [episode, ...episodes.filter((item) => item.id !== episode.id)];
  return (
    <PodcastPageShell title={episode.title} summary={episode.summary}>
      <PodcastShow episodes={ordered} activeSlug={episode.slug} />
    </PodcastPageShell>
  );
}
