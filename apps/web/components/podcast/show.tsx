"use client";

import { useEffect, useState } from "react";
import type { PublicEpisode } from "@/lib/podcast-types";
import { PodcastPlayer, clock, usePodcastPlayer } from "./player";

export function PodcastShow({ episodes, compact = false, activeSlug = null }: { episodes: PublicEpisode[]; compact?: boolean; activeSlug?: string | null }) {
  const player = usePodcastPlayer();
  const active = episodes.find((episode) => episode.slug === activeSlug) ?? episodes[0] ?? null;

  return (
    <div className="flex flex-col gap-5">
      <PodcastPlayer compact={compact} />
      {episodes.length ? (
        <ul className="flex flex-col gap-3">
          {episodes.map((episode) => {
            const on = player.episode?.id === episode.id || (!player.episode && episode.id === active?.id);
            return (
              <li key={episode.id}>
                <button type="button" onClick={() => player.play(episode, episodes)} className={`np-card flex w-full gap-3 p-3 text-left ${on ? "ring-2 ring-accent/40" : ""}`}>
                  <img src={episode.coverUrl} alt="" className="size-16 shrink-0 rounded-xl object-cover" />
                  <span className="min-w-0">
                    <span className="block text-xs font-bold tracking-wide text-muted uppercase">{episode.categoryName ?? "NewsPodcast"} · {clock(episode.durationSec)}</span>
                    <span className="mt-0.5 block font-extrabold text-ink">{episode.title}</span>
                    <span className="mt-1 line-clamp-2 block text-sm text-muted">{episode.summary}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : <p className="text-sm text-muted">Още няма публикувани епизоди.</p>}
    </div>
  );
}

export function PodcastPanel() {
  const [episodes, setEpisodes] = useState<PublicEpisode[] | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/podcasts/", { signal: controller.signal })
      .then((response) => response.ok ? response.json() : { episodes: [] })
      .then((data: { episodes: PublicEpisode[] }) => setEpisodes(data.episodes))
      .catch(() => setEpisodes([]));
    return () => controller.abort();
  }, []);
  if (!episodes) return <p className="text-sm font-semibold text-muted">Зареждане на епизодите…</p>;
  return <PodcastShow episodes={episodes} compact />;
}
