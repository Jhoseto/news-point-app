import { PUBLIC_SEO_PAGES, publicPageMetadata } from "@/lib/public-metadata";
import { JsonLd } from "@/components/json-ld";
import { breadcrumbList, collectionPage, podcastSeries } from "@/lib/jsonld";
import { preload } from "react-dom";
import { PodcastPageShell } from "@/components/podcast/page-shell";
import { PodcastShow } from "@/components/podcast/show";
import { shareOrigin } from "@/lib/share-card";
import { STUDIO_PHOTO } from "@/components/podcast/studio-photo";
import { publicEpisodes } from "@/lib/podcasts";

export const metadata = publicPageMetadata("podcast");

export const revalidate = 60;

export default async function PodcastPage() {
  // The theatre background is the LCP element; preloading it removes the discovery round-trip.
  preload(STUDIO_PHOTO.avif, {
    as: "image",
    fetchPriority: "high",
    imageSrcSet: STUDIO_PHOTO.srcsetAvif,
    imageSizes: STUDIO_PHOTO.sizes,
  });
  const episodes = await publicEpisodes();
  const origin = shareOrigin();
  const visibleEpisodes = episodes.slice(0, 10);
  const page = PUBLIC_SEO_PAGES.podcast;
  return (
    <PodcastPageShell>
      <JsonLd id="np-ld-podcast" data={[
        podcastSeries(origin, page.description, visibleEpisodes),
        collectionPage({ origin, path: page.path, title: page.title, description: page.description, items: visibleEpisodes }),
        breadcrumbList(origin, [{ name: "Начало", path: "/" }, { name: "NewsPodcast" }]),
      ]} />
      <PodcastShow episodes={episodes} publicOrigin={origin} />
    </PodcastPageShell>
  );
}
