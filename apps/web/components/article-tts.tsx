"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ArticleBody } from "@newspoint/content";
import type { Media } from "@/lib/queries";
import { buildUtterances, clearPos, loadPos, savePos } from "@/lib/tts";
import { createEngine, decodeSpeechParts, engineTime, pauseEngine, playEngine, type SpeechEngine } from "@/lib/tts/speech-engine";
import { unpackSpeechParts } from "@/lib/tts/speech-parts";
import "./article-tts.css";

interface ArticleTtsProps {
  articleId: string;
  title: string;
  excerpt: string;
  body: ArticleBody;
  media: Map<string, Media>;
}

function formatClock(seconds: number): string {
  if (!Number.isFinite(seconds)) return "0:00";
  const total = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `${minutes}:${rest.toString().padStart(2, "0")}`;
}

function weightsOf(texts: readonly string[]): number[] {
  return texts.map((text) => Math.max(1, text.length));
}

function indexAtRatio(weights: readonly number[], ratio: number): number {
  const total = weights.reduce((sum, item) => sum + item, 0);
  const target = Math.min(total - 1, Math.max(0, ratio * total));
  let cursor = 0;
  for (let index = 0; index < weights.length; index += 1) {
    cursor += weights[index] ?? 0;
    if (target < cursor) return index;
  }
  return Math.max(0, weights.length - 1);
}

function ratioAtIndex(weights: readonly number[], index: number): number {
  const total = weights.reduce((sum, item) => sum + item, 0);
  if (total <= 0) return 0;
  let cursor = 0;
  for (let i = 0; i < index && i < weights.length; i += 1) cursor += weights[i] ?? 0;
  return cursor / total;
}

export function ArticleTts(props: ArticleTtsProps) {
  const [phase, setPhase] = useState<"idle" | "loading" | "playing" | "paused">("idle");
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [index, setIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const engineRef = useRef<SpeechEngine | null>(null);
  const scrubbing = useRef(false);
  const scrolledAnchor = useRef<string | null>(null);
  const savedIndex = useRef(0);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  const utterances = useMemo(
    () =>
      buildUtterances({
        id: props.articleId,
        title: props.title,
        excerpt: props.excerpt,
        body: props.body,
        mediaAlt: new Map([...props.media].map(([id, asset]) => [id, asset.alt ?? ""] as const)),
      }),
    [props.articleId, props.title, props.excerpt, props.body, props.media],
  );
  const weights = useMemo(() => weightsOf(utterances.map((item) => item.text)), [utterances]);
  const weightsRef = useRef(weights);
  weightsRef.current = weights;

  const placeTime = useCallback((seconds: number, total: number) => {
    setTime(seconds);
    if (total > 0) setIndex(indexAtRatio(weightsRef.current, seconds / total));
  }, []);

  useEffect(() => {
    const saved = loadPos(props.articleId);
    savedIndex.current = saved && saved.index > 0 ? saved.index : 0;
  }, [props.articleId]);

  useEffect(() => {
    return () => {
      const engine = engineRef.current;
      if (!engine) return;
      pauseEngine(engine);
      void engine.context.close();
    };
  }, []);

  useEffect(() => {
    if (phase !== "playing") return;
    let frame = 0;
    const tick = () => {
      const engine = engineRef.current;
      if (engine && !scrubbing.current) placeTime(engineTime(engine), engine.buffer.duration);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [phase, placeTime]);

  useEffect(() => {
    if (phase !== "playing" && phase !== "paused") return;
    const timer = window.setInterval(() => {
      savePos(props.articleId, { index, charIndex: 0, ts: Date.now() });
    }, 4000);
    return () => window.clearInterval(timer);
  }, [phase, index, props.articleId]);

  useEffect(() => {
    document.querySelectorAll(".np-tts-active").forEach((el) => el.classList.remove("np-tts-active"));
    const anchorId = utterances[index]?.anchorId;
    if (!anchorId || phase !== "playing") return;
    const el = document.getElementById(anchorId);
    if (!el) return;
    el.classList.add("np-tts-active");
    if (anchorId === scrolledAnchor.current) return;
    scrolledAnchor.current = anchorId;
    const rect = el.getBoundingClientRect();
    if (rect.top >= 80 && rect.bottom <= window.innerHeight - 32) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
  }, [utterances, index, phase]);

  const startAt = useCallback((seconds: number) => {
    const engine = engineRef.current;
    if (!engine) return;
    playEngine(engine, seconds, () => {
      setPhase("idle");
      setTime(0);
      setIndex(0);
      clearPos(props.articleId);
    });
    setPhase("playing");
    placeTime(seconds, engine.buffer.duration);
  }, [placeTime, props.articleId]);

  const onToggle = useCallback(async () => {
    const engine = engineRef.current;
    if (phaseRef.current === "playing" && engine) {
      const at = pauseEngine(engine);
      setPhase("paused");
      placeTime(at, engine.buffer.duration);
      return;
    }
    if (phaseRef.current === "paused" && engine) {
      startAt(engine.offset);
      return;
    }
    if (engine && phaseRef.current === "idle") {
      startAt(0);
      return;
    }
    setError(null);
    setPhase("loading");
    const context = new AudioContext();
    void context.resume();
    try {
      const response = await fetch(`/api/articles/${props.articleId}/speech/?v=3`);
      if (!response.ok) throw new Error("speech");
      const parts = unpackSpeechParts(new Uint8Array(await response.arrayBuffer()));
      const buffer = await decodeSpeechParts(context, parts);
      const next = createEngine(context, buffer);
      engineRef.current = next;
      setDuration(buffer.duration);
      const start = savedIndex.current > 0 ? ratioAtIndex(weightsRef.current, savedIndex.current) * buffer.duration : 0;
      await context.resume();
      startAt(start);
    } catch {
      void context.close();
      engineRef.current = null;
      setPhase("idle");
      setError("Четенето не тръгна. Опитайте отново.");
    }
  }, [placeTime, props.articleId, startAt]);

  const onSeek = useCallback((seconds: number) => {
    const engine = engineRef.current;
    if (!engine) return;
    const next = Math.min(engine.buffer.duration, Math.max(0, seconds));
    if (engine.source) startAt(next);
    else {
      engine.offset = next;
      placeTime(next, engine.buffer.duration);
    }
  }, [placeTime, startAt]);

  const playing = phase === "playing";
  const progress = duration > 0 ? Math.min(100, (time / duration) * 100) : 0;

  return (
    <div className="np-tts-wrap">
      <div className="np-tts">
        <button
          type="button"
          className="np-tts-play"
          data-playing={playing ? "true" : "false"}
          aria-pressed={playing}
          aria-busy={phase === "loading"}
          aria-label={playing ? "Пауза" : "Слушай статията"}
          disabled={utterances.length === 0 || phase === "loading"}
          onClick={() => void onToggle()}
        >
          {playing ? <PauseIcon /> : <PlayIcon />}
          {playing ? null : <span>{phase === "loading" ? "Чете се" : "Слушай"}</span>}
        </button>
        <input
          className="np-tts-timeline"
          type="range"
          min={0}
          max={duration > 0 ? duration : 1}
          step={0.1}
          value={Math.min(time, duration || 0)}
          disabled={duration <= 0}
          aria-label="Място в статията"
          aria-valuemin={0}
          aria-valuemax={Math.round(duration)}
          aria-valuenow={Math.round(time)}
          aria-valuetext={`${formatClock(time)} от ${formatClock(duration)}`}
          style={{ ["--np-tts-progress" as string]: `${progress}%` }}
          onPointerDown={() => {
            scrubbing.current = true;
          }}
          onPointerUp={(event) => {
            scrubbing.current = false;
            onSeek(Number(event.currentTarget.value));
          }}
          onChange={(event) => {
            const value = Number(event.target.value);
            if (scrubbing.current) {
              setTime(value);
              return;
            }
            onSeek(value);
          }}
        />
        <span className="np-tts-clock">
          {formatClock(time)} / {formatClock(duration)}
        </span>
      </div>
      {error ? <p className="np-tts-note">{error}</p> : null}
    </div>
  );
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" width={14} height={14} aria-hidden="true">
      <path d="M8 5.5v13l11-6.5-11-6.5z" fill="currentColor" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" width={14} height={14} aria-hidden="true">
      <path d="M7 5h3.2v14H7V5zm6.8 0H17v14h-3.2V5z" fill="currentColor" />
    </svg>
  );
}
