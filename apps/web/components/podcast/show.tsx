"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type MouseEvent, type TransitionEvent } from "react";
import { createPortal } from "react-dom";
import type { PublicEpisode } from "@/lib/podcast-types";
import { displayedEpisode } from "../../lib/podcast-playback";
import { PodcastPlayer, clock, usePodcastPlayer } from "./player";
import { PodcastTimeline } from "./timeline";
import { PodcastShareMenu } from "./share-menu";
import { STUDIO_PHOTO } from "./studio-photo";
import { ChevronRightIcon } from "../icons";
import { AudioIcon, PodcastCover, PodcastOrbit } from "./visuals";

function episodeTeaser(summary: string) {
  const text = summary.trim();
  if (text.length <= 140) return text;
  const prefix = text.slice(0, 140);
  const lastSpace = prefix.lastIndexOf(" ");
  return (lastSpace > 0 ? prefix.slice(0, lastSpace) : prefix).trimEnd() + "…";
}

function EpisodeCard({
  episode,
  episodes,
  selected,
  compact,
  publicOrigin,
  openAfterPlay,
}: {
  episode: PublicEpisode;
  episodes: PublicEpisode[];
  selected: boolean;
  compact: boolean;
  publicOrigin?: string;
  openAfterPlay?: () => void;
}) {
  const player = usePodcastPlayer();
  const loaded = player.episode?.id === episode.id;
  const playing = loaded && player.playing;
  const published = new Intl.DateTimeFormat("bg-BG", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Sofia" }).format(new Date(episode.publishedAt));
  const shareUrl = publicOrigin ? new URL(episode.path, publicOrigin).href : episode.path;
  return <li className={`np-podcast-episode ${compact ? "np-podcast-episode--row" : ""}`} data-active={selected}>
    <div className="np-podcast-episode-art"><PodcastCover src={episode.coverUrl} /></div>
    <div className="np-podcast-episode-info">
      <p className="np-podcast-category">{episode.categoryName ?? "Podcast"}</p>
      <h3><Link href={episode.path}><span>{episode.title}</span></Link></h3>
      <p className="np-podcast-episode-summary">{episodeTeaser(episode.summary)}</p>
      <div className="np-podcast-episode-meta"><time dateTime={episode.publishedAt}>{published}</time><span>·</span><span>{clock(episode.durationSec)}</span></div>
      <span className="np-podcast-episode-status">{selected ? playing ? "Слушате" : loaded ? "На пауза" : "Избран" : ""}</span>
    </div>
    <div className="np-podcast-episode-actions">
      <button className="np-podcast-card-play" onClick={() => { player.play(episode, episodes); openAfterPlay?.(); }} aria-label={`${playing ? "Пауза" : "Слушай"}: ${episode.title}`}><AudioIcon name={playing ? "pause" : "play"} /></button>
      {publicOrigin ? (
        <PodcastShareMenu
          url={shareUrl}
          title={episode.title}
          summary={episode.summary}
          coverUrl={episode.coverUrl}
          durationLabel={clock(episode.durationSec)}
          categoryName={episode.categoryName}
          variant="card"
        />
      ) : null}
    </div>
  </li>;
}

export function PodcastShow({ episodes, compact = false, activeSlug = null, publicOrigin, aboutInitiallyOpen = true }: { episodes: PublicEpisode[]; compact?: boolean; activeSlug?: string | null; publicOrigin?: string; aboutInitiallyOpen?: boolean }) {
  const player = usePodcastPlayer();
  const suggested = episodes.find((episode) => episode.slug === activeSlug) ?? episodes[0] ?? null;
  const current = episodes.find(episode => episode.id === player.episode?.id) ?? null;
  const selected = activeSlug ? suggested : displayedEpisode(current, suggested);
  if (!episodes.length && (!compact || !player.episode)) {
    return <PodcastState title={compact ? "Историите скоро ще имат глас" : "Подкасти на NewsPoint"} pageHeading={!compact} description="Още няма публикувани епизоди. Тук ще откриете подкастите на NewsPoint." />;
  }
  if (!compact && selected) return <PodcastTheater episodes={episodes} selected={selected} activeSlug={activeSlug} publicOrigin={publicOrigin} aboutInitiallyOpen={aboutInitiallyOpen} />;
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
          <span>Podcast</span>
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

function PodcastTheater({ episodes, selected, activeSlug, publicOrigin, aboutInitiallyOpen }: { episodes: PublicEpisode[]; selected: PublicEpisode; activeSlug: string | null; publicOrigin: string | undefined; aboutInitiallyOpen: boolean }) {
  const router = useRouter();
  const mainPlayer = useRef<HTMLDivElement>(null);
  const [playerPassed, setPlayerPassed] = useState(false);
  const player = usePodcastPlayer();
  const [aboutMounted, setAboutMounted] = useState(aboutInitiallyOpen);
  const [aboutOpen, setAboutOpen] = useState(aboutInitiallyOpen);
  const published = new Intl.DateTimeFormat("bg-BG", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Sofia" }).format(new Date(selected.publishedAt));
  const shareUrl = publicOrigin ? new URL(selected.path, publicOrigin).href : selected.path;
  useEffect(() => {
    setAboutMounted(aboutInitiallyOpen);
    setAboutOpen(aboutInitiallyOpen);
  }, [selected.id, aboutInitiallyOpen]);
  useEffect(() => {
    const update = () => {
      const node = mainPlayer.current;
      if (!node) return;
      setPlayerPassed(node.getBoundingClientRect().bottom < 0);
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => { window.removeEventListener("scroll", update); window.removeEventListener("resize", update); };
  }, []);
  function toggleAbout(event: MouseEvent<HTMLElement>) {
    event.preventDefault();
    if (aboutOpen) {
      setAboutOpen(false);
      if (document.documentElement.dataset.reducedMotion === "true" || matchMedia("(prefers-reduced-motion: reduce)").matches) setAboutMounted(false);
      return;
    }
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
        {activeSlug ? <>
          <p className="np-podcast-feature-kicker"><span className="np-podcast-feature-kicker-line" />NewsPoint Audio <span>·</span> {selected.categoryName ?? "Подкаст"}</p>
          <h1 id="np-podcast-feature-title" className="np-podcast-feature-title">{selected.title}</h1>
        </> : <>
          <h1 className="np-podcast-feature-kicker"><span className="np-podcast-feature-kicker-line" />Подкасти на NewsPoint</h1>
          <h2 id="np-podcast-feature-title" className="np-podcast-feature-title"><Link href={selected.path}>{selected.title}</Link></h2>
        </>}
        <div className="np-podcast-feature-meta"><time dateTime={selected.publishedAt}>{published}</time><span aria-hidden="true">·</span><span>{clock(selected.durationSec)}</span></div>
        <div className="np-podcast-feature-actions">
          {publicOrigin ? (
            <PodcastShareMenu
              url={shareUrl}
              title={selected.title}
              summary={selected.summary}
              coverUrl={selected.coverUrl}
              durationLabel={clock(selected.durationSec)}
              categoryName={selected.categoryName}
            />
          ) : null}
        </div>
        <details className="np-podcast-feature-details" open={aboutMounted} data-expanded={aboutOpen || undefined}>
          <summary onClick={toggleAbout} aria-expanded={aboutOpen}>За епизода <span aria-hidden="true">＋</span></summary>
          <div className="np-podcast-feature-about-panel" onTransitionEnd={settleAbout}>
            <div className="np-podcast-feature-about">
              <PodcastCover src={selected.coverUrl} />
              <p>{activeSlug ? selected.summary : episodeTeaser(selected.summary)}</p>
            </div>
          </div>
        </details>
        <div ref={mainPlayer} className="np-podcast-main-player"><PodcastPlayer theater suggested={selected} episodes={episodes} /></div>
      </div>
    </section>
    <section className="np-podcast-carousel" aria-labelledby="np-podcast-carousel-title">
      <div className="np-podcast-carousel-heading">
        <div><p>NewsPoint Audio</p><h2 id="np-podcast-carousel-title">Всички епизоди</h2></div>
        {activeSlug && <Link href="/livepoint/podcast/">Към подкастите</Link>}
      </div>
      <ul>{episodes.map((episode) => (
        <EpisodeCard
          key={episode.id}
          episode={episode}
          episodes={episodes}
          compact
          selected={selected.id === episode.id}
          {...(activeSlug && activeSlug !== episode.slug ? { openAfterPlay: () => router.push(episode.path, { scroll: false }) } : {})}
          {...(publicOrigin ? { publicOrigin } : {})}
        />
      ))}</ul>
    </section>
    {playerPassed && player.episode && !player.error && createPortal(<div className="np-podcast-dock" role="region" aria-label="Плеър при скрол">
      <div className="np-podcast-dock-art"><PodcastCover src={player.episode.coverUrl} /></div>
      <div className="np-podcast-dock-info"><span>{player.playing ? "Слушате сега" : "На пауза"}</span><strong>{player.episode.title}</strong></div>
      <div className="np-podcast-dock-timeline"><PodcastTimeline current={player.current} duration={player.duration} buffered={player.duration ? Math.min(100, player.buffered / player.duration * 100) : 0} playing={player.playing && !player.waiting} waiting={player.waiting} disabled={!player.duration} onSeek={player.seek} /></div>
      <button className="np-podcast-dock-toggle" onClick={player.toggle} aria-label={player.playing ? "Пауза" : "Продължи слушането"}><AudioIcon name={player.playing ? "pause" : "play"} /></button>
    </div>, document.body)}
  </div>;
}

function PodcastState({ title, description, retry, loading = false, pageHeading = false }: { title: string; description: string; retry?: () => void; loading?: boolean; pageHeading?: boolean }) {
  const Heading = pageHeading ? "h1" : "h3";
  return <div className="np-podcast-state" role={retry ? "alert" : "status"} aria-busy={loading}>
    <PodcastOrbit /><Heading>{title}</Heading><p>{description}</p>{retry && <button className="np-podcast-retry" onClick={retry}>Опитай отново</button>}
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
  if (!episodes) return <PodcastState title="Подготвяме епизодите" description="Зареждане на Podcast…" loading />;
  return <PodcastShow episodes={episodes} compact />;
}
