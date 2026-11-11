"use client";

import { PodcastPanel } from "../podcast/show";

/** The root player stays mounted as readers navigate between public pages. */
export function LivePointPodcastPanel() {
  return <PodcastPanel />;
}
