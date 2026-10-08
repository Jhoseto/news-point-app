import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { preload } from "react-dom";
import { PodcastPageShell } from "@/components/podcast/page-shell";
import { PodcastShow } from "@/components/podcast/show";
import { STUDIO_PHOTO } from "@/components/podcast/studio-photo";
import { publicEpisode, publicEpisodes } from "@/lib/podcasts";
import { publicMetadata } from "@/lib/public-metadata";

export const revalidate = 60;

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const episode = await publicEpisode((await params).slug);
  if (!episode) notFound();
  return publicMetadata({ path: episode.path, title: `${episode.title} · NewsPodcast`, description: episode.summary, imagePath: `/share/podcast/${episode.slug}/` });
}

export default async function PodcastEpisodePage({ params }: Props) {
  // The theatre background is the LCP element; preloading it removes the discovery round-trip.
  preload(STUDIO_PHOTO.avif, {
    as: "image",
    fetchPriority: "high",
    imageSrcSet: STUDIO_PHOTO.srcsetAvif,
    imageSizes: STUDIO_PHOTO.sizes,
  });
  const slug = (await params).slug;
  const [episode, episodes] = await Promise.all([publicEpisode(slug), publicEpisodes()]);
  if (!episode) notFound();
  const ordered = [episode, ...episodes.filter((item) => item.id !== episode.id)];
  return (
    <PodcastPageShell title={episode.title}>
      <PodcastShow episodes={ordered} activeSlug={episode.slug} />
    </PodcastPageShell>
  );
}
