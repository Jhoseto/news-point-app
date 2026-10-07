"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useReducedMotion } from "./reader-preferences";

/** Keeps the current stop in the compact article rail in view. */
export function StoryRoadmapScroll({ children }: { children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    const current = root.current?.querySelector<HTMLElement>("[data-current]");
    current?.scrollIntoView({ block: "center", inline: "nearest", behavior: reduceMotion ? "auto" : "smooth" });
  }, [reduceMotion]);

  return (
    <div ref={root} className="np-story-rail-scroller">
      {children}
    </div>
  );
}
