"use client";

import { useId, useRef, useState, type CSSProperties } from "react";
import { playbackClock } from "@/lib/podcast-playback";

/** Decorative motion: deliberately independent of the audio output and decoding. */
export function PodcastTimeline({ current, duration, buffered, playing, waiting, disabled, onSeek }: {
  current: number; duration: number; buffered: number; playing: boolean; waiting: boolean; disabled: boolean;
  onSeek: (seconds: number) => void;
}) {
  const id = useId().replaceAll(":", "");
  const dragging = useRef(false);
  const draftRef = useRef<number | null>(null);
  const [draft, setDraft] = useState<number | null>(null);
  const time = draft ?? current;
  const percent = duration ? time / duration * 100 : 0;
  function finish(commit: boolean) {
    if (!dragging.current) return;
    dragging.current = false;
    if (commit && draftRef.current !== null) onSeek(draftRef.current);
    draftRef.current = null;
    setDraft(null);
  }
  return <div className="np-audio-timeline" data-moving={playing && draft === null} data-scrubbing={draft !== null}>
    <div className="np-audio-wave" style={{ "--seek": `${percent}%`, "--buffer": `${buffered}%` } as CSSProperties}>
      <svg viewBox="0 0 600 56" preserveAspectRatio="none" aria-hidden="true">
        <defs><linearGradient id={id}><stop stopColor="#62d8ff" /><stop offset=".55" stopColor="#6494ff" /><stop offset="1" stopColor="#bd8bff" /></linearGradient></defs>
        <g className="np-audio-wave-motion" fill="none" stroke={`url(#${id})`} strokeLinecap="round">
          <path className="np-audio-wave-back" d="M0 28 C30 28 35 13 65 20 S105 45 140 29 S175 12 210 25 S250 42 285 28 S325 9 360 24 S400 44 435 29 S470 15 505 25 S555 36 600 28" />
          <path className="np-audio-wave-front" d="M0 28 C25 28 40 36 65 28 S110 8 140 23 S180 43 210 28 S250 13 285 26 S325 43 360 29 S400 11 435 25 S480 40 505 28 S560 20 600 28" />
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
