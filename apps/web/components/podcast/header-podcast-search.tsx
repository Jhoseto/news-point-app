"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import type { PublicEpisode } from "@/lib/podcast-types";
import { SiteSearch } from "../site-search";
import { usePodcastPlayer } from "./provider";
import "./header-podcast.css";

const HeaderPodcastPlayer = dynamic(() => import("./header-podcast-player").then((module) => module.HeaderPodcastPlayer), { ssr: false });

export function HeaderPodcastSearch() {
  const { episode } = usePodcastPlayer();
  const [exitingEpisode, setExitingEpisode] = useState<PublicEpisode | null>(null);

  useEffect(() => {
    if (episode) {
      setExitingEpisode(episode);
      return;
    }
    const timer = window.setTimeout(() => setExitingEpisode(null), 400);
    return () => window.clearTimeout(timer);
  }, [episode]);

  const visibleEpisode = episode ?? exitingEpisode;
  return <div className="np-header-podcast-pair" data-open={episode ? "true" : undefined}>
    <div className="np-header-search-slot"><SiteSearch /></div>
    <div className="np-header-podcast-slot" aria-hidden={!episode} inert={!episode}>
      {visibleEpisode ? <HeaderPodcastPlayer episode={visibleEpisode} closing={!episode} /> : null}
    </div>
  </div>;
}
