import { publicPageMetadata } from "@/lib/public-metadata";
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
  return (
    <PodcastPageShell>
      <PodcastShow episodes={episodes} publicOrigin={shareOrigin()} />
    </PodcastPageShell>
  );
}
