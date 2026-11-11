"use client";

import Link from "next/link";
import type { PublicEpisode } from "@/lib/podcast-types";
import { playbackClock } from "@/lib/podcast-playback";
import { CloseIcon } from "../icons";
import { PodcastTimeline } from "./timeline";
import { AudioIcon, PodcastCover } from "./visuals";
import { usePodcastPlayer } from "./provider";

export function HeaderPodcastPlayer({ episode, closing }: { episode: PublicEpisode; closing: boolean }) {
  const player = usePodcastPlayer();
  const duration = closing ? episode.durationSec : player.duration;
  const current = closing ? 0 : player.current;
  return <section className="np-header-podcast-player" data-podcast-player data-playing={player.playing} aria-label="Подкаст плеър в навигацията">
    <div className="np-header-podcast-art"><PodcastCover src={episode.coverUrl} /></div>
    <div className="np-header-podcast-content">
      <div className="np-header-podcast-caption"><Link href={episode.path} title={episode.title}>{episode.title}</Link><span>{playbackClock(current)}</span></div>
      <PodcastTimeline current={current} duration={duration} buffered={duration ? Math.min(100, player.buffered / duration * 100) : 0} playing={player.playing && !player.waiting} waiting={player.waiting} disabled={closing || !duration} onSeek={player.seek} />
    </div>
    <button type="button" className="np-header-podcast-toggle" onClick={player.toggle} disabled={closing} aria-label={player.playing ? "Пауза" : "Продължи слушането"}><AudioIcon name={player.playing ? "pause" : "play"} /></button>
    <button type="button" className="np-header-podcast-close" onClick={player.stop} disabled={closing} aria-label="Затвори плеъра и спри звука" title="Затвори плеъра"><CloseIcon width={14} height={14} /></button>
  </section>;
}
