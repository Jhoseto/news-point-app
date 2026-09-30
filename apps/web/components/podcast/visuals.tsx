"use client";

import { useState } from "react";

export function PodcastOrbit({ className = "" }: { className?: string }) {
  return <img src="/brand/mark.svg" alt="" aria-hidden="true" className={`np-podcast-orbit ${className}`} />;
}

export function PodcastCover({ src, className = "" }: { src: string; className?: string }) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  return <div className={`np-podcast-cover ${className}`}>
    {failedSrc === src ? <><PodcastOrbit /><span>NewsPodcast</span></> : <img src={src} alt="" onError={() => setFailedSrc(src)} />}
  </div>;
}

export function AudioIcon({ name }: { name: "play" | "pause" | "previous" | "next" | "back" | "forward" | "volume" | "muted" | "timer" | "link" | "share" }) {
  return <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {name === "play" && <path d="m9 5 11 7-11 7Z" fill="currentColor" stroke="none" />}
    {name === "pause" && <><rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none" /><rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none" /></>}
    {name === "previous" && <><path d="m18 5-10 7 10 7Z" fill="currentColor" stroke="none" /><path d="M5 5v14" /></>}
    {name === "next" && <><path d="m6 5 10 7-10 7Z" fill="currentColor" stroke="none" /><path d="M19 5v14" /></>}
    {(name === "back" || name === "forward") && <g transform={name === "forward" ? "translate(24 0) scale(-1 1)" : undefined}><path d="M4 10a8 8 0 1 1 0 5M4 4v6h6" /></g>}
    {(name === "volume" || name === "muted") && <><path d="M11 4 6 8H3v8h3l5 4Z" />{name === "volume" ? <path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14" /> : <path d="m16 9 5 6m0-6-5 6" />}</>}
    {name === "timer" && <><circle cx="12" cy="14" r="8" /><path d="M12 10v4l3 2M9 2h6M12 2v4" /></>}
    {name === "link" && <><path d="m10 13 4-4m-5 8-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m0 8a4 4 0 0 0 6 0l4-4a4 4 0 0 0-6-6l-1 1" /></>}
    {name === "share" && <><circle cx="18" cy="5" r="2.5" /><circle cx="6" cy="12" r="2.5" /><circle cx="18" cy="19" r="2.5" /><path d="m8.2 10.8 7.6-4.5m-7.6 6.9 7.6 4.5" /></>}
  </svg>;
}
