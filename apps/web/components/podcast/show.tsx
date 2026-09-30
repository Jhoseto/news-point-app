"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type MouseEvent } from "react";
import type { PublicEpisode } from "@/lib/podcast-types";
import { displayedEpisode } from "@/lib/podcast-playback";
import { PodcastPlayer, clock, usePodcastPlayer } from "./player";
import { AudioIcon, PodcastCover, PodcastOrbit } from "./visuals";

function EpisodeCard({ episode, episodes, selected, compact }: { episode: PublicEpisode; episodes: PublicEpisode[]; selected: boolean; compact: boolean }) {
  const player = usePodcastPlayer();
  const loaded = player.episode?.id === episode.id;
  const playing = loaded && player.playing;
  const published = new Intl.DateTimeFormat("bg-BG", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Sofia" }).format(new Date(episode.publishedAt));
  return <li className={`np-podcast-episode ${compact ? "np-podcast-episode--row" : ""}`} data-active={selected}>
    <div className="np-podcast-episode-art"><PodcastCover src={episode.coverUrl} /></div>
    <div className="np-podcast-episode-info">
      <p className="np-podcast-category">{episode.categoryName ?? "NewsPodcast"}</p>
      <h3><Link href={episode.path}><span>{episode.title}</span></Link></h3>
      <p className="np-podcast-episode-summary">{episode.summary}</p>
      <div className="np-podcast-episode-meta"><time dateTime={episode.publishedAt}>{published}</time><span>·</span><span>{clock(episode.durationSec)}</span></div>
      <span className="np-podcast-episode-status">{selected ? playing ? "Слушате" : loaded ? "На пауза" : "Избран" : ""}</span>
    </div>
    <button className="np-podcast-card-play" onClick={() => player.play(episode, episodes)} aria-label={`${playing ? "Пауза" : "Слушай"}: ${episode.title}`}><AudioIcon name={playing ? "pause" : "play"} /></button>
  </li>;
}

export function PodcastShow({ episodes, compact = false, activeSlug = null }: { episodes: PublicEpisode[]; compact?: boolean; activeSlug?: string | null }) {
  const player = usePodcastPlayer();
  const suggested = episodes.find((episode) => episode.slug === activeSlug) ?? episodes[0] ?? null;
  const selected = displayedEpisode(player.episode, suggested);
  const listed = activeSlug ? episodes.filter((episode) => episode.slug !== activeSlug) : episodes;
  if (!episodes.length && !player.episode) return <PodcastState title="Историите скоро ще имат глас" description="Още няма публикувани епизоди. Тук ще откриете подкастите на NewsPoint." />;
  if (!compact && selected) return <PodcastTheater episodes={episodes} selected={selected} activeSlug={activeSlug} />;
  return <div className={`np-podcast-show ${compact ? "np-podcast-show--panel" : "np-podcast-show--page"}`}>
    <PodcastPlayer compact={compact} suggested={suggested} episodes={episodes} />
    <section className="np-podcast-library" aria-label={activeSlug ? "Още епизоди" : "Епизоди"}>
      <div className="np-podcast-library-heading"><div><p className="np-podcast-eyebrow">Истории с глас</p><h2>{activeSlug ? "Още за слушане" : "Епизоди"}</h2></div><span>NewsPodcast</span></div>
      {listed.length ? <ul className="np-podcast-episodes">{listed.map((episode) => <EpisodeCard key={episode.id} episode={episode} episodes={episodes} compact={compact} selected={selected?.id === episode.id} />)}</ul> : <p className="np-podcast-no-more">Няма други публикувани епизоди.</p>}
    </section>
  </div>;
}

const ABOUT_MS = 280;

function PodcastTheater({ episodes, selected, activeSlug }: { episodes: PublicEpisode[]; selected: PublicEpisode; activeSlug: string | null }) {
  const carousel = useRef<HTMLUListElement>(null);
  const aboutClose = useRef<number | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [canNativeShare, setCanNativeShare] = useState(false);
  const [message, setMessage] = useState("");
  const [aboutMounted, setAboutMounted] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const published = new Intl.DateTimeFormat("bg-BG", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Sofia" }).format(new Date(selected.publishedAt));
  const shareUrl = new URL(selected.path, "https://newspoint.bg").href;
  const encodedUrl = encodeURIComponent(shareUrl);
  const encodedTitle = encodeURIComponent(selected.title);
  useEffect(() => setCanNativeShare(typeof navigator.share === "function"), []);
  useEffect(() => () => { if (aboutClose.current != null) window.clearTimeout(aboutClose.current); }, []);
  useEffect(() => {
    if (!shareOpen) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setShareOpen(false); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [shareOpen]);
  async function nativeShare() {
    if (!navigator.share) { await copyShareLink(); return; }
    try { await navigator.share({ title: selected.title, text: selected.summary, url: shareUrl }); setShareOpen(false); }
    catch (error) { if ((error as DOMException).name !== "AbortError") setMessage("Споделянето не беше завършено."); }
  }
  async function copyShareLink() {
    try { await navigator.clipboard.writeText(shareUrl); setMessage("Линкът е копиран."); setShareOpen(false); }
    catch { setMessage("Линкът не беше копиран."); }
  }
  function moveCarousel(direction: 1 | -1) {
    carousel.current?.scrollBy({ left: direction * Math.min(360, carousel.current.clientWidth * .82), behavior: "smooth" });
  }
  function toggleAbout(event: MouseEvent<HTMLElement>) {
    event.preventDefault();
    if (aboutClose.current != null) {
      window.clearTimeout(aboutClose.current);
      aboutClose.current = null;
    }
    if (aboutOpen) {
      setAboutOpen(false);
      aboutClose.current = window.setTimeout(() => {
        setAboutMounted(false);
        aboutClose.current = null;
      }, ABOUT_MS);
      return;
    }
    setAboutMounted(true);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setAboutOpen(true));
    });
  }
  return <div className="np-podcast-theater">
    <picture className="np-podcast-theater-photo"><source media="(max-width: 640px)" srcSet="/brand/podcast-studio-768.webp" /><img src="/brand/podcast-studio-1462.webp" width={1462} height={519} alt="" fetchPriority="high" decoding="async" /></picture>
    <div className="np-podcast-theater-shade" />
    <section className="np-podcast-feature" aria-labelledby="np-podcast-feature-title">
      <div className="np-podcast-feature-content">
        <p className="np-podcast-feature-kicker"><span className="np-podcast-feature-kicker-line" />NewsPoint Audio <span>·</span> {selected.categoryName ?? "Подкаст"}</p>
        <h1 id="np-podcast-feature-title">{selected.title}</h1>
        <div className="np-podcast-feature-meta"><time dateTime={selected.publishedAt}>{published}</time><span aria-hidden="true">·</span><span>{clock(selected.durationSec)}</span></div>
        <div className="np-podcast-feature-actions">
          <div className="np-podcast-share">
            <button className="np-podcast-feature-share" aria-expanded={shareOpen} aria-controls="np-podcast-share-menu" onClick={() => setShareOpen((open) => !open)}><AudioIcon name="share" />Сподели</button>
            <div id="np-podcast-share-menu" className="np-podcast-share-menu" hidden={!shareOpen}>
              {canNativeShare && <button onClick={() => void nativeShare()}>Сподели от устройството</button>}
              <a href={`https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`} target="_blank" rel="noreferrer">Facebook</a>
              <a href={`https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedTitle}`} target="_blank" rel="noreferrer">X / Twitter</a>
              <a href={`viber://forward?text=${encodedTitle}%20${encodedUrl}`}>Viber</a>
              <button onClick={() => void copyShareLink()}>Копирай линка</button>
            </div>
          </div>
          <span role="status">{message}</span>
        </div>
        <details className="np-podcast-feature-details" open={aboutMounted} data-expanded={aboutOpen || undefined}>
          <summary onClick={toggleAbout} aria-expanded={aboutOpen}>За епизода <span aria-hidden="true">＋</span></summary>
          <div className="np-podcast-feature-about-panel">
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
      <ul ref={carousel}>{episodes.slice(0, 10).map((episode) => <EpisodeCard key={episode.id} episode={episode} episodes={episodes} compact selected={selected.id === episode.id} />)}</ul>
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
