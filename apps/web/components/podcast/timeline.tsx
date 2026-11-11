"use client";

import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { playbackClock } from "@/lib/podcast-playback";
import { PODCAST_WAVE_POINTS, PODCAST_WAVE_FFT_SIZE, podcastWavePaths } from "@/lib/podcast-waveform";
import { usePodcastPlayer } from "./provider";

const IDLE_WAVE = podcastWavePaths(new Uint8Array(PODCAST_WAVE_FFT_SIZE).fill(128), new Float32Array(PODCAST_WAVE_POINTS * 3));

/** One seek control, a live signal and its fading peak memory. */
export function PodcastTimeline({ current, duration, buffered, playing, waiting, disabled, onSeek }: {
  current: number; duration: number; buffered: number; playing: boolean; waiting: boolean; disabled: boolean;
  onSeek: (seconds: number) => void;
}) {
  const id = useId().replaceAll(":", "");
  const dragging = useRef(false);
  const draftRef = useRef<number | null>(null);
  const frontPath = useRef<SVGPathElement>(null);
  const backPath = useRef<SVGPathElement>(null);
  const waveHistory = useRef(new Float32Array(PODCAST_WAVE_POINTS * 3));
  const [draft, setDraft] = useState<number | null>(null);
  const { episode, readWaveform } = usePodcastPlayer();
  const time = draft ?? current;
  const percent = duration ? time / duration * 100 : 0;
  useEffect(() => {
    waveHistory.current.fill(0);
    frontPath.current?.setAttribute("d", IDLE_WAVE.front);
    backPath.current?.setAttribute("d", IDLE_WAVE.back);
    if (backPath.current) backPath.current.style.opacity = "0";
  }, [episode?.id]);
  useEffect(() => {
    if (!playing || waiting || disabled || draft !== null || !frontPath.current || !backPath.current) return;
    const front = frontPath.current;
    const back = backPath.current;
    const samples = new Uint8Array(PODCAST_WAVE_FFT_SIZE);
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let visible = true;
    let disposed = false;
    let frame = 0;
    let lastFrame = 0;
    function sync() {
      if (disposed) return;
      if (reducedMotion.matches || document.hidden || !visible) {
        if (frame) cancelAnimationFrame(frame);
        frame = 0;
      } else if (!frame) frame = requestAnimationFrame(tick);
    }
    function tick(now: number) {
      frame = 0;
      if (now - lastFrame >= 1000 / 30) {
        const elapsedMs = lastFrame ? now - lastFrame : 33;
        lastFrame = now;
        if (readWaveform(samples)) {
          const paths = podcastWavePaths(samples, waveHistory.current, elapsedMs);
          front.setAttribute("d", paths.front);
          back.setAttribute("d", paths.back);
          back.style.opacity = String(paths.echoOpacity);
        }
      }
      sync();
    }
    const observer = typeof IntersectionObserver === "function"
      ? new IntersectionObserver(([entry]) => { visible = entry?.isIntersecting ?? false; sync(); })
      : null;
    observer?.observe(front);
    reducedMotion.addEventListener("change", sync);
    document.addEventListener("visibilitychange", sync);
    sync();
    return () => {
      disposed = true;
      if (frame) cancelAnimationFrame(frame);
      observer?.disconnect();
      reducedMotion.removeEventListener("change", sync);
      document.removeEventListener("visibilitychange", sync);
    };
  }, [playing, waiting, disabled, draft, readWaveform]);
  function finish(commit: boolean) {
    if (!dragging.current) return;
    dragging.current = false;
    if (commit && draftRef.current !== null) onSeek(draftRef.current);
    draftRef.current = null;
    setDraft(null);
  }
  return <div className="np-audio-timeline" data-scrubbing={draft !== null}>
    <div className="np-audio-wave" style={{ "--seek": `${percent}%`, "--buffer": `${buffered}%` } as CSSProperties}>
      <svg viewBox="0 0 600 56" preserveAspectRatio="none" aria-hidden="true">
        <defs><linearGradient id={id}><stop stopColor="var(--np-podcast-wave-1)" /><stop offset=".55" stopColor="var(--np-accent)" /><stop offset="1" stopColor="var(--np-podcast-wave-2)" /></linearGradient></defs>
        <g fill="none" stroke={`url(#${id})`} strokeLinecap="round">
          <path ref={backPath} className="np-audio-wave-back" d={IDLE_WAVE.back} />
          <path ref={frontPath} className="np-audio-wave-front" d={IDLE_WAVE.front} />
        </g>
      </svg>
      <div className="np-audio-wave-progress" aria-hidden="true" />
      <span className="np-audio-wave-cursor" aria-hidden="true" />
      <input type="range" min={0} max={duration || 1} step={1} value={time} disabled={disabled}
        aria-label="Позиция в епизода" aria-valuetext={`${playbackClock(time)} от ${playbackClock(duration)}`}
        onPointerDown={(event) => { dragging.current = true; event.currentTarget.setPointerCapture(event.pointerId); }}
        onChange={(event) => { const value = Number(event.currentTarget.value); if (dragging.current) { draftRef.current = value; setDraft(value); } else onSeek(value); }}
        onPointerUp={() => finish(true)} onPointerCancel={() => finish(false)} onLostPointerCapture={() => finish(true)}
        onBlur={() => finish(true)} />
    </div>
    <div className="np-podcast-times"><span>{playbackClock(time)}</span><span className="np-audio-status" role="status">{waiting ? "Буфериране…" : draft !== null ? "Превъртане" : ""}</span><span>{playbackClock(duration)}</span></div>
  </div>;
}
