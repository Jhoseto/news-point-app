import type { Metadata } from "next";
import { PodcastPageShell } from "@/components/podcast/page-shell";
import { PodcastShow } from "@/components/podcast/show";
import { publicEpisodes } from "@/lib/podcasts";

export const metadata: Metadata = {
  title: "NewsPodcast · LivePoint",
  description: "Подкасти на NewsPoint за слушане.",
};

export const revalidate = 60;

export default async function PodcastPage() {
  const episodes = await publicEpisodes();
  return (
    <PodcastPageShell>
      <PodcastShow episodes={episodes} />
    </PodcastPageShell>
  );
}
