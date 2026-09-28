"use client";

import { useEffect, useRef } from "react";

/** Decorative progress through the article body, independent of the footer and sidebars. */
export function ReadingProgress() {
  const bar = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const body = document.getElementById("np-article-body");
    if (!body) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const rect = body.getBoundingClientRect();
      const header = document.querySelector<HTMLElement>("[data-np-header]")?.getBoundingClientRect().height ?? 0;
      if (bar.current?.parentElement) bar.current.parentElement.style.top = `${Math.max(0, header - 3)}px`;
      const start = window.scrollY + rect.top - header;
      const end = window.scrollY + rect.bottom - window.innerHeight + Math.min(window.innerHeight * 0.2, 160);
      const progress = Math.max(0, Math.min(1, (window.scrollY - start) / Math.max(1, end - start)));
      if (bar.current) bar.current.style.transform = `scaleX(${progress})`;
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    const observer = new ResizeObserver(schedule);
    observer.observe(body);
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    schedule();
    return () => {
      if (frame) cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, []);

  return <span aria-hidden="true" className="np-reading-progress"><span ref={bar} /></span>;
}
