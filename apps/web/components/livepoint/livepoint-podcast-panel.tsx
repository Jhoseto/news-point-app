"use client";

import { PodcastProvider } from "../podcast/provider";
import { PodcastPanel } from "../podcast/show";

/** Podcast panel needs player context; root layout no longer wraps every page. */
export function LivePointPodcastPanel() {
  return (
    <PodcastProvider>
      <PodcastPanel />
    </PodcastProvider>
  );
}
