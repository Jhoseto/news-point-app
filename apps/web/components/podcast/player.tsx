"use client";

import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import type { PublicEpisode } from "@/lib/podcast-types";
import { adjacentEpisode, clampPlaybackTime, displayedEpisode, playbackClock } from "@/lib/podcast-playback";
import { AudioIcon, PodcastCover } from "./visuals";
import { PodcastTimeline } from "./timeline";

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
  waiting: boolean;
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

export function PodcastProvider({ children }: { children: ReactNode }) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [waiting, setWaiting] = useState(false);
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
  const startAudio = useCallback(() => {
    const node = audio.current;
    if (!node) return;
    setError("");
    if (node.error) {
      const resume = node.currentTime;
      node.addEventListener("loadedmetadata", () => {
        node.currentTime = clampPlaybackTime(resume, node.duration);
        void node.play().catch(() => setError("Звукът не може да се пусне. Опитайте отново."));
      }, { once: true });
      node.load();
    } else void node.play().catch(() => setError("Звукът не може да се пусне. Опитайте отново."));
  }, []);
  useEffect(() => {
    episodeRef.current = episode;
    queueRef.current = queue;
  });

  const step = useCallback((direction: 1 | -1) => {
    const next = adjacentEpisode(queueRef.current, episodeRef.current?.id ?? null, direction);
    if (!next) return;
    setEpisode(next);
    setBuffered(0);
    setError("");
  }, []);

  useEffect(() => {
    const node = new Audio();
    node.preload = "auto";
    audio.current = node;
    const onTime = () => {
      setCurrent(node.currentTime);
      const end = node.buffered.length ? node.buffered.end(node.buffered.length - 1) : 0;
      setBuffered(end);
    };
    const onMeta = () => setDuration(Number.isFinite(node.duration) ? node.duration : 0);
    const onPlay = () => setPlaying(true);
    const onPlaying = () => { setPlaying(true); setWaiting(false); };
    const onWaiting = () => setWaiting(true);
    const onSeeked = () => { onTime(); setWaiting(!node.paused && node.readyState < 3); };
    const onPause = () => { setPlaying(false); setWaiting(false); };
    const onError = () => { setWaiting(false); setPlaying(false); if (node.getAttribute("src")) setError("Звукът не може да се пусне."); };
    const onEnded = () => { setPlaying(false); setWaiting(false); step(1); };
    node.addEventListener("playing", onPlaying);
    node.addEventListener("waiting", onWaiting);
    node.addEventListener("seeking", onWaiting);
    node.addEventListener("seeked", onSeeked);
    node.addEventListener("progress", onTime);
    node.addEventListener("timeupdate", onTime);
    node.addEventListener("durationchange", onMeta);
    node.addEventListener("play", onPlay);
    node.addEventListener("pause", onPause);
    node.addEventListener("error", onError);
    node.addEventListener("ended", onEnded);
    return () => {
      node.removeEventListener("playing", onPlaying);
      node.removeEventListener("waiting", onWaiting);
      node.removeEventListener("seeking", onWaiting);
      node.removeEventListener("seeked", onSeeked);
      node.removeEventListener("progress", onTime);
      node.removeEventListener("timeupdate", onTime);
      node.removeEventListener("durationchange", onMeta);
      node.removeEventListener("play", onPlay);
      node.removeEventListener("pause", onPause);
      node.removeEventListener("error", onError);
      node.removeEventListener("ended", onEnded);
      node.pause();
      node.src = "";
      audio.current = null;
    };
  }, [step]);

  useEffect(() => {
    const node = audio.current;
    if (!node || !episode) return;
    let dropped = false;
    setError("");
    setCurrent(0);
    setWaiting(true);
    setDuration(episode.durationSec);
    const onReady = () => {
      if (dropped) return;
      node.currentTime = 0;
      void node.play().catch(() => { if (!dropped) { setWaiting(false); setPlaying(false); setError("Натиснете Слушай, за да започне звукът."); } });
    };
    node.addEventListener("loadedmetadata", onReady, { once: true });
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
    const timer = window.setTimeout(() => { audio.current?.pause(); setSleepMin(null); }, sleepMin * 60_000);
    return () => window.clearTimeout(timer);
  }, [sleepMin]);

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
      ["seekto", (details) => { if (audio.current && details.seekTime !== undefined) audio.current.currentTime = clampPlaybackTime(details.seekTime, audio.current.duration); }],
      ["previoustrack", () => step(-1)],
      ["nexttrack", () => step(1)],
    ];
    for (const [name, handler] of pairs) {
      try { navigator.mediaSession.setActionHandler(name, handler); } catch { /* unsupported action */ }
    }
    return () => { for (const [name] of pairs) { try { navigator.mediaSession.setActionHandler(name, null); } catch { /* unsupported action */ } } };
  }, [episode, step]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (!episodeRef.current || !audio.current) return;
      if (target?.closest("input, textarea, select, button, a, [contenteditable='true']")) return;
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
    episode, queue, playing, current, duration: duration || episode?.durationSec || 0, buffered, volume, muted, rate, sleepMin, error, waiting,
    play: (next, list) => {
        setQueue(list);
      if (episodeRef.current?.id === next.id) {
        if (audio.current?.paused) startAudio(); else audio.current?.pause();
        return;
      }
      setBuffered(0); setPlaying(false); setEpisode(next); setError("");
    },
    toggle: () => { const node = audio.current; if (!node) return; if (node.paused) startAudio(); else node.pause(); },
    seek: (seconds) => { const node = audio.current; if (node && node.readyState > 0) { const target = clampPlaybackTime(seconds, node.duration); setCurrent(target); node.currentTime = target; } },
    skip: (delta) => { const node = audio.current; if (node && node.readyState > 0) node.currentTime = clampPlaybackTime(node.currentTime + delta, node.duration); },
    step,
    setVolume: setVolumeState,
    setMuted: setMutedState,
    setRate: setRateState,
    setSleep: setSleepMin,
  }), [episode, queue, playing, current, duration, buffered, volume, muted, rate, sleepMin, error, waiting, step, startAudio]);

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}

export function clock(seconds: number) {
  return playbackClock(seconds);
}

export function PodcastPlayer({ compact = false, theater = false, suggested = null, episodes = [] }: { compact?: boolean; theater?: boolean; suggested?: PublicEpisode | null; episodes?: PublicEpisode[] }) {
  const player = usePodcastPlayer();
  const episode = displayedEpisode(player.episode, suggested);
  const loaded = !!player.episode;
  const duration = loaded ? player.duration : episode?.durationSec ?? 0;
  const current = loaded ? clampPlaybackTime(player.current, duration) : 0;
  const played = duration ? current / duration * 100 : 0;
  const buffered = loaded && duration ? Math.min(100, player.buffered / duration * 100) : 0;
  const [copied, setCopied] = useState("");
  const toolsId = useId();
  const [tools, setTools] = useState(false);
  const queue = loaded ? player.queue : episodes;
  const canPrevious = !!adjacentEpisode(queue, episode?.id ?? null, -1);
  const canNext = !!adjacentEpisode(queue, episode?.id ?? null, 1);
  useEffect(() => setCopied(""), [episode?.id]);

  async function copyLink() {
    if (!episode) return;
    try { await navigator.clipboard.writeText(new URL(episode.path, window.location.origin).href); setCopied("Линкът е копиран."); }
    catch { setCopied("Линкът не беше копиран. Опитайте отново."); }
  }
  function start() {
    if (!episode) return;
    if (loaded) player.toggle(); else player.play(episode, episodes);
  }
  function step(direction: 1 | -1) {
    if (loaded) player.step(direction);
    else { const next = adjacentEpisode(episodes, episode?.id ?? null, direction); if (next) player.play(next, episodes); }
  }
  // Both layouts render the same settings panel and the same failure block; only the chrome differs.
  const extraPanel = <div id={toolsId} className="np-podcast-extra" hidden={!tools}>
    <label>Сила на звука<input type="range" min={0} max={1} step={0.05} value={player.muted ? 0 : player.volume} onChange={(event) => { player.setMuted(false); player.setVolume(Number(event.target.value)); }} /></label>
    <label>Таймер<select value={player.sleepMin ?? ""} onChange={(event) => player.setSleep(event.target.value ? Number(event.target.value) : null)}>{SLEEP.map((minutes) => <option key={minutes ?? "off"} value={minutes ?? ""}>{minutes ? `${minutes} мин` : "Изключен"}</option>)}</select></label>
  </div>;
  const errorPanel = player.error
    ? <div className="np-podcast-error" role="alert"><p>{player.error}</p><button onClick={start}>Опитай отново</button></div>
    : null;

  if (!episode) return null;
  if (theater) return (
    <section data-podcast-player data-playing={player.playing} className="np-podcast-player np-podcast-player--theater" aria-label="Плеър за NewsPodcast">
      <div className="np-podcast-artwork"><PodcastCover src={episode.coverUrl} /></div>
      <button className="np-podcast-play" onClick={start} aria-label={player.playing ? "Пауза" : "Слушай"}><AudioIcon name={player.playing ? "pause" : "play"} /></button>
      <div className="np-podcast-theater-timeline">
        <PodcastTimeline current={current} duration={duration} buffered={buffered} playing={player.playing && !player.waiting} waiting={player.waiting} disabled={!loaded || !duration} onSeek={player.seek} />
      </div>
      <div className="np-podcast-theater-controls">
        <label className="np-podcast-rate"><span className="sr-only">Скорост</span><select value={player.rate} aria-label="Скорост на възпроизвеждане" onChange={(event) => player.setRate(Number(event.target.value))}>{RATES.map((rate) => <option key={rate} value={rate}>{rate}×</option>)}</select></label>
        <button className="np-podcast-control np-podcast-skip" onClick={() => player.skip(-15)} disabled={!loaded} aria-label="15 секунди назад"><AudioIcon name="back" /><span>15</span></button>
        <button className="np-podcast-control np-podcast-skip" onClick={() => player.skip(15)} disabled={!loaded} aria-label="15 секунди напред"><AudioIcon name="forward" /><span>15</span></button>
        <button className="np-podcast-tool" aria-label={player.muted ? "Включи звука" : "Изключи звука"} onClick={() => player.setMuted(!player.muted)}><AudioIcon name={player.muted ? "muted" : "volume"} /></button>
        <button className="np-podcast-tool" aria-expanded={tools} aria-controls={toolsId} onClick={() => setTools(!tools)}><AudioIcon name="timer" /><span className="sr-only">Таймер</span></button>
      </div>
      {extraPanel}
      {errorPanel}
    </section>
  );
  return (
    <section data-podcast-player data-playing={player.playing} className={`np-podcast-player ${compact ? "np-podcast-player--compact" : ""} ${theater ? "np-podcast-player--theater" : ""}`} aria-label="Плеър за NewsPodcast">
      <div className="np-podcast-artwork">
        <PodcastCover src={episode.coverUrl} />
      </div>
      <div className="np-podcast-player-content">
        <div className="np-podcast-eyebrow"><span className="np-podcast-dot" />{loaded ? player.playing ? "Слушате" : "Пауза" : "Готов за слушане"}</div>
        <p className="np-podcast-category">{episode.categoryName ?? "NewsPodcast"}</p>
        <h2>{episode.title}</h2>
        <p className="np-podcast-player-summary">{episode.summary}</p>
        <PodcastTimeline current={current} duration={duration} buffered={buffered} playing={player.playing && !player.waiting} waiting={player.waiting} disabled={!loaded || !duration} onSeek={player.seek} />
        <div className="np-podcast-transport">
          <button className="np-podcast-control" onClick={() => step(-1)} disabled={!canPrevious} aria-label="Предишен епизод"><AudioIcon name="previous" /></button>
          <button className="np-podcast-control np-podcast-skip" onClick={() => player.skip(-15)} disabled={!loaded} aria-label="15 секунди назад"><AudioIcon name="back" /><span>15</span></button>
          <button className="np-podcast-play" onClick={start} aria-label={player.playing ? "Пауза" : "Слушай"}><AudioIcon name={player.playing ? "pause" : "play"} /></button>
          <button className="np-podcast-control np-podcast-skip" onClick={() => player.skip(15)} disabled={!loaded} aria-label="15 секунди напред"><AudioIcon name="forward" /><span>15</span></button>
          <button className="np-podcast-control" onClick={() => step(1)} disabled={!canNext} aria-label="Следващ епизод"><AudioIcon name="next" /></button>
        </div>
        <div className="np-podcast-tools">
          <button className="np-podcast-tool" aria-label={player.muted ? "Включи звука" : "Изключи звука"} onClick={() => player.setMuted(!player.muted)}><AudioIcon name={player.muted ? "muted" : "volume"} /></button>
          <label className="np-podcast-rate"><span>Скорост</span><select value={player.rate} aria-label="Скорост на възпроизвеждане" onChange={(event) => player.setRate(Number(event.target.value))}>{RATES.map((rate) => <option key={rate} value={rate}>{rate}×</option>)}</select></label>
          <button className="np-podcast-tool" aria-expanded={tools} aria-controls={toolsId} onClick={() => setTools(!tools)}><AudioIcon name="timer" /><span>{player.sleepMin ? `${player.sleepMin} мин` : "Настройки"}</span></button>
        </div>
        {extraPanel}
        <div className="np-podcast-actions"><button onClick={() => void copyLink()}><AudioIcon name="link" />Копирай линка</button></div>
        <p className="np-podcast-feedback" role="status">{copied}</p>
        {errorPanel}
      </div>
    </section>
  );
}
