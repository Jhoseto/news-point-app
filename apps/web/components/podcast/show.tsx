"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type MouseEvent, type TransitionEvent } from "react";
import type { PublicEpisode } from "@/lib/podcast-types";
import { displayedEpisode } from "@/lib/podcast-playback";
import { PodcastPlayer, clock, usePodcastPlayer } from "./player";
import { PodcastShareMenu } from "./share-menu";
import { STUDIO_PHOTO } from "./studio-photo";
import { ChevronRightIcon } from "../icons";
import { AudioIcon, PodcastCover, PodcastOrbit } from "./visuals";

function EpisodeCard({
  episode,
  episodes,
  selected,
  compact,
  publicOrigin,
}: {
  episode: PublicEpisode;
  episodes: PublicEpisode[];
  selected: boolean;
  compact: boolean;
  publicOrigin?: string;
}) {
  const player = usePodcastPlayer();
  const loaded = player.episode?.id === episode.id;
  const playing = loaded && player.playing;
  const published = new Intl.DateTimeFormat("bg-BG", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Sofia" }).format(new Date(episode.publishedAt));
  const shareUrl = publicOrigin ? new URL(episode.path, publicOrigin).href : episode.path;
  return <li className={`np-podcast-episode ${compact ? "np-podcast-episode--row" : ""}`} data-active={selected}>
    <div className="np-podcast-episode-art"><PodcastCover src={episode.coverUrl} /></div>
    <div className="np-podcast-episode-info">
      <p className="np-podcast-category">{episode.categoryName ?? "NewsPodcast"}</p>
      <h3><Link href={episode.path}><span>{episode.title}</span></Link></h3>
      <p className="np-podcast-episode-summary">{episode.summary}</p>
      <div className="np-podcast-episode-meta"><time dateTime={episode.publishedAt}>{published}</time><span>·</span><span>{clock(episode.durationSec)}</span></div>
      <span className="np-podcast-episode-status">{selected ? playing ? "Слушате" : loaded ? "На пауза" : "Избран" : ""}</span>
    </div>
    <div className="np-podcast-episode-actions">
      {publicOrigin ? <PodcastShareMenu url={shareUrl} title={episode.title} summary={episode.summary} variant="card" /> : null}
      <button className="np-podcast-card-play" onClick={() => player.play(episode, episodes)} aria-label={`${playing ? "Пауза" : "Слушай"}: ${episode.title}`}><AudioIcon name={playing ? "pause" : "play"} /></button>
    </div>
  </li>;
}

export function PodcastShow({ episodes, compact = false, activeSlug = null, publicOrigin }: { episodes: PublicEpisode[]; compact?: boolean; activeSlug?: string | null; publicOrigin?: string }) {
  const player = usePodcastPlayer();
  const suggested = episodes.find((episode) => episode.slug === activeSlug) ?? episodes[0] ?? null;
  const selected = displayedEpisode(player.episode, suggested);
  if (!episodes.length && !player.episode) return <PodcastState title="Историите скоро ще имат глас" description="Още няма публикувани епизоди. Тук ще откриете подкастите на NewsPoint." />;
  if (!compact && selected) return <PodcastTheater episodes={episodes} selected={selected} activeSlug={activeSlug} publicOrigin={publicOrigin} />;
  // Only the LivePoint panel reaches this branch: the page always goes to the theatre.
  return <PodcastPanelLayout episodes={episodes} suggested={suggested} selected={selected} />;
}

function PodcastPanelLayout({
  episodes,
  suggested,
  selected,
}: {
  episodes: PublicEpisode[];
  suggested: PublicEpisode | null;
  selected: PublicEpisode | null;
}) {
  const [playerOpen, setPlayerOpen] = useState(true);
  return (
    <div className="np-podcast-show np-podcast-show--panel" data-player-open={playerOpen || undefined}>
      <div id="np-podcast-player-region" className="np-podcast-player-shell">
        <PodcastPlayer compact suggested={suggested} episodes={episodes} />
      </div>
      <button
        type="button"
        className="np-podcast-panel-split"
        data-collapsed={playerOpen ? undefined : true}
        aria-expanded={playerOpen}
        aria-controls="np-podcast-player-region"
        onClick={() => setPlayerOpen((open) => !open)}
      >
        <ChevronRightIcon width={14} height={14} aria-hidden="true" />
        <span className="sr-only">{playerOpen ? "Прибери плеъра" : "Разпъни плеъра"}</span>
      </button>
      <section className="np-podcast-library" aria-label="Епизоди">
        <div className="np-podcast-library-heading">
          <div>
            <p className="np-podcast-eyebrow">Истории с глас</p>
            <h2>Епизоди</h2>
          </div>
          <span>NewsPodcast</span>
        </div>
        {episodes.length ? (
          <ul className="np-podcast-episodes">
            {episodes.map((episode) => (
              <EpisodeCard key={episode.id} episode={episode} episodes={episodes} compact selected={selected?.id === episode.id} />
            ))}
          </ul>
        ) : (
          <p className="np-podcast-no-more">Няма други публикувани епизоди.</p>
        )}
      </section>
    </div>
  );
}

function PodcastTheater({ episodes, selected, activeSlug, publicOrigin }: { episodes: PublicEpisode[]; selected: PublicEpisode; activeSlug: string | null; publicOrigin: string | undefined }) {
  const carousel = useRef<HTMLUListElement>(null);
  const [aboutMounted, setAboutMounted] = useState(true);
  const [aboutOpen, setAboutOpen] = useState(true);
  const published = new Intl.DateTimeFormat("bg-BG", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Sofia" }).format(new Date(selected.publishedAt));
  const shareUrl = publicOrigin ? new URL(selected.path, publicOrigin).href : selected.path;
  useEffect(() => {
    setAboutMounted(true);
    setAboutOpen(true);
  }, [selected.id]);
  function moveCarousel(direction: 1 | -1) {
    carousel.current?.scrollBy({ left: direction * Math.min(360, carousel.current.clientWidth * .82), behavior: "smooth" });
  }
  function toggleAbout(event: MouseEvent<HTMLElement>) {
    event.preventDefault();
    if (aboutOpen) { setAboutOpen(false); return; }
    setAboutMounted(true);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setAboutOpen(true));
    });
  }
  // The panel keeps its height until the collapse finishes, then unmounts. Driven by the CSS
  // transition itself, so the two can never drift apart.
  function settleAbout(event: TransitionEvent<HTMLDivElement>) {
    if (event.propertyName === "grid-template-rows" && !aboutOpen) setAboutMounted(false);
  }
  return <div className="np-podcast-theater">
    <picture className="np-podcast-theater-photo" style={{ backgroundImage: `url(${STUDIO_PHOTO.lqip})` }}>
      <source type="image/avif" srcSet={STUDIO_PHOTO.srcsetAvif} sizes={STUDIO_PHOTO.sizes} />
      <source type="image/webp" srcSet={STUDIO_PHOTO.srcsetWebp} sizes={STUDIO_PHOTO.sizes} />
      <img src={STUDIO_PHOTO.fallback} srcSet={STUDIO_PHOTO.srcsetJpeg} sizes={STUDIO_PHOTO.sizes}
        width={STUDIO_PHOTO.width} height={STUDIO_PHOTO.height} alt="" fetchPriority="high" decoding="async" />
    </picture>
    <div className="np-podcast-theater-shade" />
    <section className="np-podcast-feature" aria-labelledby="np-podcast-feature-title">
      <div className="np-podcast-feature-content">
        <p className="np-podcast-feature-kicker"><span className="np-podcast-feature-kicker-line" />NewsPoint Audio <span>·</span> {selected.categoryName ?? "Подкаст"}</p>
        <h1 id="np-podcast-feature-title">{selected.title}</h1>
        <div className="np-podcast-feature-meta"><time dateTime={selected.publishedAt}>{published}</time><span aria-hidden="true">·</span><span>{clock(selected.durationSec)}</span></div>
        <div className="np-podcast-feature-actions">
          {publicOrigin ? (
            <PodcastShareMenu url={shareUrl} title={selected.title} summary={selected.summary} />
          ) : null}
        </div>
        <details className="np-podcast-feature-details" open={aboutMounted} data-expanded={aboutOpen || undefined}>
          <summary onClick={toggleAbout} aria-expanded={aboutOpen}>За епизода <span aria-hidden="true">＋</span></summary>
          <div className="np-podcast-feature-about-panel" onTransitionEnd={settleAbout}>
            <div className="np-podcast-feature-about">
              <PodcastCover src={selected.coverUrl} />
              <p>{selected.summary}</p>
            </div>
          </div>
        </details>
        <PodcastPlayer theater suggested={selected} episodes={episodes} />
      </div>
    </section>
    <section className="np-podcast-carousel" aria-labelledby="np-podcast-carousel-title">
      <div className="np-podcast-carousel-heading">
        <div><p>NewsPodcast</p><h2 id="np-podcast-carousel-title">Последни епизоди</h2></div>
        <div className="np-podcast-carousel-actions">
          {activeSlug && <Link href="/livepoint/podcast/">Виж всички</Link>}
          <button onClick={() => moveCarousel(-1)} disabled={episodes.length < 2} aria-label="Предишни епизоди">←</button>
          <button onClick={() => moveCarousel(1)} disabled={episodes.length < 2} aria-label="Следващи епизоди">→</button>
        </div>
      </div>
      <ul ref={carousel}>{episodes.slice(0, 10).map((episode) => (
        <EpisodeCard
          key={episode.id}
          episode={episode}
          episodes={episodes}
          compact
          selected={selected.id === episode.id}
          {...(publicOrigin ? { publicOrigin } : {})}
        />
      ))}</ul>
    </section>
  </div>;
}

function PodcastState({ title, description, retry, loading = false }: { title: string; description: string; retry?: () => void; loading?: boolean }) {
  return <div className="np-podcast-state" role={retry ? "alert" : "status"} aria-busy={loading}>
    <PodcastOrbit /><h3>{title}</h3><p>{description}</p>{retry && <button className="np-podcast-retry" onClick={retry}>Опитай отново</button>}
  </div>;
}

export function PodcastPanel() {
  const [episodes, setEpisodes] = useState<PublicEpisode[] | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setError(false);
    setEpisodes(null);
    void fetch("/api/podcasts/", { signal: controller.signal })
      .then(async (response) => { if (!response.ok) throw new Error("Podcast request failed"); return response.json(); })
      .then((data: { episodes: PublicEpisode[] }) => { if (!Array.isArray(data.episodes)) throw new Error("Invalid podcast response"); if (!controller.signal.aborted) setEpisodes(data.episodes); })
      .catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [attempt]);
  if (error) return <PodcastState title="Епизодите не се заредиха" description="Опитайте отново след малко." retry={() => setAttempt((value) => value + 1)} />;
  if (!episodes) return <PodcastState title="Подготвяме епизодите" description="Зареждане на NewsPodcast…" loading />;
  return <PodcastShow episodes={episodes} compact />;
}
