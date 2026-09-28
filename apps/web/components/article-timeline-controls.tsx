"use client";

import { useEffect, useRef } from "react";

export function ArticleTimelineControls({ children }: { children: React.ReactNode }) {
  const track = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = track.current;
    const current = element?.querySelector<HTMLElement>("[data-current-story]");
    if (element && current && element.scrollWidth > element.clientWidth) {
      element.scrollLeft = current.offsetLeft - element.offsetLeft - (element.clientWidth - current.clientWidth) / 2;
    }
  }, []);

  const move = (direction: number) => {
    const element = track.current;
    if (!element) return;
    const item = element.querySelector<HTMLElement>(".np-article-timeline-item");
    const distance = (item?.getBoundingClientRect().width ?? 260) + 16;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches || document.documentElement.dataset.reducedMotion === "true";
    element.scrollBy({ left: direction * distance, behavior: reduced ? "instant" : "smooth" });
  };

  return (
    <>
      <div className="np-article-timeline-controls" aria-label="Прелистване на хронологията">
        <button type="button" onClick={() => move(-1)} aria-label="Към по-ранните статии">←</button>
        <button type="button" onClick={() => move(1)} aria-label="Към по-новите статии">→</button>
      </div>
      <div ref={track} className="np-article-timeline-track" tabIndex={0} aria-label="Хронология на статиите">
        {children}
      </div>
    </>
  );
}
