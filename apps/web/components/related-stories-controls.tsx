"use client";

import { useEffect, useRef } from "react";
import { desktopDistance } from "@/lib/desktop-viewport";

export function RelatedStoriesControls({ children }: { children: React.ReactNode }) {
  const track = useRef<HTMLDivElement>(null);
  const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches || document.documentElement.dataset.reducedMotion === "true";

  useEffect(() => {
    const element = track.current;
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
      const max = element.scrollWidth - element.clientWidth;
      if (max <= 0) return;
      if ((event.deltaY < 0 && element.scrollLeft <= 1) || (event.deltaY > 0 && element.scrollLeft >= max - 1)) return;
      event.preventDefault();
      const unit = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 24 : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? element.clientWidth * 0.85 : desktopDistance(1);
      element.scrollBy({ left: event.deltaY * unit, behavior: reducedMotion() ? "instant" : "smooth" });
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, []);

  const move = (direction: number) => {
    const element = track.current;
    if (!element) return;
    const card = element.querySelector<HTMLElement>(".np-related-card");
    element.scrollBy({ left: direction * ((card ? desktopDistance(card.getBoundingClientRect().width) : 300) + 16), behavior: reducedMotion() ? "instant" : "smooth" });
  };

  return (
    <div className="np-related-carousel">
      <div className="np-related-controls" aria-label="Прелистване на свързаните статии">
        <button type="button" onClick={() => move(-1)} aria-label="Назад">←</button>
        <button type="button" onClick={() => move(1)} aria-label="Напред">→</button>
      </div>
      <div ref={track} className="np-related-track" tabIndex={0} aria-label="Свързани статии">{children}</div>
    </div>
  );
}
