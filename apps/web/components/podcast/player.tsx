"use client";

import { useEffect, useId, useState } from "react";
import type { PublicEpisode } from "@/lib/podcast-types";
import { adjacentEpisode, clampPlaybackTime, displayedEpisode, playbackClock } from "@/lib/podcast-playback";
import { ChevronRightIcon } from "../icons";
import { AudioIcon, PodcastCover } from "./visuals";
import { PodcastTimeline } from "./timeline";
import { usePodcastPlayer } from "./provider";

export { PodcastProvider, usePodcastPlayer } from "./provider";

const RATES = [0.75, 1, 1.25, 1.5, 1.75, 2];
const SLEEP = [null, 5, 15, 30, 60] as const;

export function clock(seconds: number) {
  return playbackClock(seconds);
}

export function PodcastPlayer({ compact = false, theater = false, suggested = null, episodes = [] }: { compact?: boolean; theater?: boolean; suggested?: PublicEpisode | null; episodes?: PublicEpisode[] }) {
  const player = usePodcastPlayer();
  const episode = displayedEpisode(player.episode, suggested);
  const loaded = !!player.episode;
  const duration = loaded ? player.duration : episode?.durationSec ?? 0;
  const current = loaded ? clampPlaybackTime(player.current, duration) : 0;
  const buffered = loaded && duration ? Math.min(100, player.buffered / duration * 100) : 0;
  const [copied, setCopied] = useState("");
  const [summaryOpen, setSummaryOpen] = useState(false);
  const toolsId = useId();
  const [tools, setTools] = useState(false);
  const queue = loaded ? player.queue : episodes;
  const canPrevious = !!adjacentEpisode(queue, episode?.id ?? null, -1);
  const canNext = !!adjacentEpisode(queue, episode?.id ?? null, 1);
  useEffect(() => {
    setCopied("");
    setSummaryOpen(false);
  }, [episode?.id]);

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
        {compact ? (
          <button
            type="button"
            className="np-podcast-player-summary np-podcast-player-summary--expandable"
            data-expanded={summaryOpen || undefined}
            aria-expanded={summaryOpen}
            aria-label={summaryOpen ? "Свий описанието" : "Разгъни описанието"}
            onClick={() => setSummaryOpen((open) => !open)}
          >
            <span className="np-podcast-player-summary-text">{episode.summary}</span>
            <span className="np-podcast-player-summary-chevron" aria-hidden="true">
              <ChevronRightIcon width={16} height={16} />
            </span>
          </button>
        ) : (
          <p className="np-podcast-player-summary">{episode.summary}</p>
        )}
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
