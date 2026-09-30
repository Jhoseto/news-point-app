"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode } from "react";
import type { PublicEpisode } from "@/lib/podcast-types";
import { adjacentEpisode, playbackClock, seekRatio } from "@/lib/podcast-playback";

const RATES = [0.75, 1, 1.25, 1.5, 1.75, 2];
const SLEEP = [null, 5, 15, 30, 60] as const;

type PlayerValue = {
  episode: PublicEpisode | null;
  queue: PublicEpisode[];
  playing: boolean;
  current: number;
  duration: number;
  buffered: number;
  volume: number;
  muted: boolean;
  rate: number;
  sleepMin: number | null;
  error: string;
  play: (episode: PublicEpisode, queue: PublicEpisode[]) => void;
  toggle: () => void;
  seek: (seconds: number) => void;
  skip: (delta: number) => void;
  step: (direction: 1 | -1) => void;
  setVolume: (value: number) => void;
  setMuted: (value: boolean) => void;
  setRate: (value: number) => void;
  setSleep: (minutes: number | null) => void;
};

const PlayerContext = createContext<PlayerValue | null>(null);

export function usePodcastPlayer() {
  const value = useContext(PlayerContext);
  if (!value) throw new Error("Podcast player is missing");
  return value;
}

function storedTime(id: string) {
  try {
    const value = Number(localStorage.getItem(`np-podcast:${id}`));
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch {
    return 0;
  }
}

function remember(id: string, seconds: number) {
  try { localStorage.setItem(`np-podcast:${id}`, String(Math.floor(seconds))); } catch { /* private mode */ }
}

export function PodcastProvider({ children }: { children: ReactNode }) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [episode, setEpisode] = useState<PublicEpisode | null>(null);
  const [queue, setQueue] = useState<PublicEpisode[]>([]);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolumeState] = useState(1);
  const [muted, setMutedState] = useState(false);
  const [rate, setRateState] = useState(1);
  const [sleepMin, setSleepMin] = useState<number | null>(null);
  const [error, setError] = useState("");
  const episodeRef = useRef(episode);
  const queueRef = useRef(queue);
  episodeRef.current = episode;
  queueRef.current = queue;

  const step = useCallback((direction: 1 | -1) => {
    const next = adjacentEpisode(queueRef.current, episodeRef.current?.id ?? null, direction);
    if (!next) return;
    setEpisode(next);
    setError("");
  }, []);

  useEffect(() => {
    const node = new Audio();
    node.preload = "metadata";
    audio.current = node;
    const onTime = () => {
      setCurrent(node.currentTime);
      if (episodeRef.current && node.currentTime > 1) remember(episodeRef.current.id, node.currentTime);
      const end = node.buffered.length ? node.buffered.end(node.buffered.length - 1) : 0;
      setBuffered(end);
    };
    const onMeta = () => setDuration(Number.isFinite(node.duration) ? node.duration : 0);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onError = () => { if (node.getAttribute("src")) setError("Звукът не може да се пусне."); };
    const onEnded = () => step(1);
    node.addEventListener("timeupdate", onTime);
    node.addEventListener("durationchange", onMeta);
    node.addEventListener("play", onPlay);
    node.addEventListener("pause", onPause);
    node.addEventListener("error", onError);
    node.addEventListener("ended", onEnded);
    return () => {
      node.pause();
      node.src = "";
    };
  }, [step]);

  useEffect(() => {
    const node = audio.current;
    if (!node || !episode) return;
    let dropped = false;
    const resume = storedTime(episode.id);
    setError("");
    setCurrent(resume);
    setDuration(episode.durationSec);
    const onReady = () => {
      if (dropped) return;
      node.currentTime = resume;
      void node.play().catch(() => setPlaying(false));
    };
    node.addEventListener("loadedmetadata", onReady);
    node.src = episode.audioUrl;
    node.load();
    return () => {
      dropped = true;
      node.removeEventListener("loadedmetadata", onReady);
    };
  }, [episode]);

  useEffect(() => {
    const node = audio.current;
    if (!node) return;
    node.volume = volume;
    node.muted = muted;
    node.playbackRate = rate;
  }, [volume, muted, rate]);

  useEffect(() => {
    if (!sleepMin) return;
    const timer = window.setTimeout(() => audio.current?.pause(), sleepMin * 60_000);
    return () => window.clearTimeout(timer);
  }, [sleepMin, episode]);

  useEffect(() => {
    if (!episode || !("mediaSession" in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: episode.title,
      artist: "NewsPoint",
      album: "NewsPodcast",
      artwork: [{ src: new URL(episode.coverUrl, window.location.origin).href, sizes: "512x512", type: "image/webp" }],
    });
    const pairs: [MediaSessionAction, MediaSessionActionHandler][] = [
      ["play", () => void audio.current?.play()],
      ["pause", () => audio.current?.pause()],
      ["seekbackward", () => { if (audio.current) audio.current.currentTime = Math.max(0, audio.current.currentTime - 15); }],
      ["seekforward", () => { if (audio.current) audio.current.currentTime = Math.min(audio.current.duration || episode.durationSec, audio.current.currentTime + 15); }],
      ["previoustrack", () => step(-1)],
      ["nexttrack", () => step(1)],
    ];
    for (const [name, handler] of pairs) {
      try { navigator.mediaSession.setActionHandler(name, handler); } catch { /* unsupported action */ }
    }
  }, [episode, step]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (!episodeRef.current || !audio.current) return;
      if (target && (target.closest("input, textarea, select, [contenteditable='true']") || target.closest("button") && event.key === " ")) return;
      const inside = !!target?.closest("[data-podcast-player]");
      if (!inside && !playing) return;
      if (event.key === " " || event.key === "k") { event.preventDefault(); if (audio.current.paused) void audio.current.play(); else audio.current.pause(); }
      else if (event.key === "ArrowLeft") { event.preventDefault(); audio.current.currentTime = Math.max(0, audio.current.currentTime - 15); }
      else if (event.key === "ArrowRight") { event.preventDefault(); audio.current.currentTime = Math.min(audio.current.duration || 0, audio.current.currentTime + 15); }
      else if (event.key === "m" || event.key === "M") setMutedState((value) => !value);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [playing]);

  const value = useMemo<PlayerValue>(() => ({
    episode, queue, playing, current, duration: duration || episode?.durationSec || 0, buffered, volume, muted, rate, sleepMin, error,
    play: (next, list) => { setQueue(list); setEpisode(next); setError(""); },
    toggle: () => { const node = audio.current; if (!node) return; if (node.paused) void node.play(); else node.pause(); },
    seek: (seconds) => { if (audio.current) audio.current.currentTime = seconds; },
    skip: (delta) => { const node = audio.current; if (node) node.currentTime = Math.max(0, Math.min(node.duration || 0, node.currentTime + delta)); },
    step,
    setVolume: setVolumeState,
    setMuted: setMutedState,
    setRate: setRateState,
    setSleep: setSleepMin,
  }), [episode, queue, playing, current, duration, buffered, volume, muted, rate, sleepMin, error, step]);

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}

export function clock(seconds: number) {
  return playbackClock(seconds);
}

export function PodcastPlayer({ compact = false }: { compact?: boolean }) {
  const player = usePodcastPlayer();
  const span = player.duration || 1;
  const played = Math.min(100, (player.current / span) * 100);
  const ahead = Math.min(100, (player.buffered / span) * 100);
  const episode = player.episode;

  function seekAt(event: PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    player.seek(seekRatio(event.clientX - rect.left, rect.width) * player.duration);
  }

  return (
    <section data-podcast-player className={`np-card overflow-hidden ${compact ? "p-4" : "p-5 sm:p-6"}`} aria-label="Плейър за NewsPodcast">
      {episode ? (
        <div className={`flex gap-4 ${compact ? "flex-col" : "flex-col sm:flex-row sm:items-center"}`}>
          <img src={episode.coverUrl} alt="" className={`${compact ? "h-36 w-full" : "size-28 sm:size-36"} shrink-0 rounded-2xl object-cover`} />
          <div className="min-w-0 flex-1">
            {episode.categoryName ? <p className="text-xs font-bold tracking-wide text-logo uppercase">{episode.categoryName}</p> : null}
            <h2 className={`${compact ? "text-lg" : "text-xl sm:text-2xl"} mt-1 font-extrabold tracking-tight text-ink`}>{episode.title}</h2>
            <p className="mt-1 line-clamp-2 text-sm text-muted">{episode.summary}</p>
          </div>
        </div>
      ) : <p className="text-sm font-semibold text-muted">Изберете епизод, за да започне слушането.</p>}

      <div className="mt-2">
        <div className="flex min-h-11 cursor-pointer items-center" onPointerDown={episode ? seekAt : undefined} role="slider" aria-label="Позиция в епизода" aria-valuemin={0} aria-valuemax={Math.floor(player.duration)} aria-valuenow={Math.floor(player.current)} tabIndex={0}>
          <div className="relative h-2 w-full rounded-full bg-line">
            <span className="absolute inset-y-0 left-0 rounded-full bg-surface-2" style={{ width: `${ahead}%` }} />
            <span className="np-gradient-bg absolute inset-y-0 left-0 rounded-full" style={{ width: `${played}%` }} />
          </div>
        </div>
        <div className="-mt-2 flex justify-between text-xs font-semibold text-muted tabular-nums">
          <span>{clock(player.current)}</span>
          <span>-{clock(Math.max(0, player.duration - player.current))}</span>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border border-line text-sm font-bold text-ink" onClick={() => player.step(-1)} aria-label="Предишен епизод">‹‹</button>
        <button type="button" className="inline-flex min-h-11 items-center rounded-full border border-line px-3 text-sm font-bold text-ink" onClick={() => player.skip(-15)} aria-label="15 секунди назад">−15</button>
        <button type="button" className="np-gradient-bg inline-flex h-12 min-w-24 items-center justify-center rounded-full px-5 text-sm font-extrabold text-white" onClick={player.toggle} disabled={!episode}>{player.playing ? "Пауза" : "Слушай"}</button>
        <button type="button" className="inline-flex min-h-11 items-center rounded-full border border-line px-3 text-sm font-bold text-ink" onClick={() => player.skip(15)} aria-label="15 секунди напред">+15</button>
        <button type="button" className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border border-line text-sm font-bold text-ink" onClick={() => player.step(1)} aria-label="Следващ епизод">››</button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
        <label className="inline-flex items-center gap-2 font-semibold text-muted">Сила
          <input type="range" min={0} max={1} step={0.05} value={player.muted ? 0 : player.volume} aria-label="Сила на звука" onChange={(event) => { player.setMuted(false); player.setVolume(Number(event.target.value)); }} />
        </label>
        <button type="button" className="min-h-11 font-bold text-ink" onClick={() => player.setMuted(!player.muted)}>{player.muted ? "Звук" : "Тих"}</button>
        <label className="inline-flex items-center gap-2 font-semibold text-muted">Скорост
          <select value={player.rate} aria-label="Скорост на възпроизвеждане" className="h-11 rounded-full border border-line bg-surface px-3 font-bold text-ink" onChange={(event) => player.setRate(Number(event.target.value))}>
            {RATES.map((item) => <option key={item} value={item}>{item}×</option>)}
          </select>
        </label>
        <label className="inline-flex items-center gap-2 font-semibold text-muted">Сън
          <select value={player.sleepMin ?? ""} aria-label="Таймер за заспиване" className="h-11 rounded-full border border-line bg-surface px-3 font-bold text-ink" onChange={(event) => player.setSleep(event.target.value ? Number(event.target.value) : null)}>
            {SLEEP.map((item) => <option key={item ?? "off"} value={item ?? ""}>{item ? `${item} мин` : "Изкл."}</option>)}
          </select>
        </label>
      </div>
      {episode ? (
        <div className="mt-3 flex flex-wrap gap-3 text-sm font-bold">
          <a className="text-link" href={`${episode.audioUrl}?download=1`}>Свали MP3</a>
          <button type="button" className="text-link" onClick={() => void navigator.clipboard.writeText(new URL(episode.path, window.location.origin).href)}>Копирай линка</button>
        </div>
      ) : null}
      {player.error ? <p role="alert" className="mt-2 text-sm font-semibold text-ink">{player.error}</p> : null}
    </section>
  );
}
