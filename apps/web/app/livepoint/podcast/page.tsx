import type { Metadata } from "next";
import { LivePointPage } from "@/components/livepoint/livepoint-page";
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
    <LivePointPage title="NewsPodcast" lead="Епизоди за слушане. Изберете тема и пуснете плейъра." wide>
      <PodcastShow episodes={episodes} />
    </LivePointPage>
  );
}
