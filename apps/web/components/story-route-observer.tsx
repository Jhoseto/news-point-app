"use client";

import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { useReducedMotion } from "./reader-preferences";

function markCurrent(root: HTMLElement, index: number) {
  root.dataset.activeStop = String(index);
  root.querySelectorAll<HTMLElement>("[data-story-stop]").forEach((node, i) => {
    node.toggleAttribute("data-current", i === index);
  });
  root.querySelectorAll<HTMLElement>("[data-story-nav]").forEach((node) => {
    node.toggleAttribute("data-current", Number(node.dataset.storyNav) === index);
  });
}

/**
 * Fills the route as the reader travels, and lights the stop nearest the
 * reading line. Reduced motion keeps the road fully drawn.
 */
export function StoryRouteObserver({
  children,
  count,
  className,
}: {
  children: ReactNode;
  count: number;
  className?: string;
}) {
  const root = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    const el = root.current;
    if (!el || count < 1) return;

    const stops = () => [...el.querySelectorAll<HTMLElement>("[data-story-stop]")];

    const update = () => {
      const nodes = stops();
      if (!nodes.length) return;
      if (reduceMotion) {
        el.style.setProperty("--np-route-progress", "100%");
        markCurrent(el, nodes.length - 1);
        return;
      }
      const readingLine = window.innerHeight * 0.38;
      const first = nodes[0]!.getBoundingClientRect();
      const last = nodes[nodes.length - 1]!.getBoundingClientRect();
      const start = first.top + first.height * 0.35;
      const end = last.top + last.height * 0.35;
      const span = end - start;
      const progress = span <= 1 ? 1 : Math.min(1, Math.max(0, (readingLine - start) / span));
      el.style.setProperty("--np-route-progress", `${progress * 100}%`);
      let nearest = 0;
      let nearestDist = Number.POSITIVE_INFINITY;
      nodes.forEach((node, index) => {
        const box = node.getBoundingClientRect();
        const dist = Math.abs(box.top + box.height * 0.35 - readingLine);
        if (dist < nearestDist) {
          nearestDist = dist;
          nearest = index;
        }
      });
      markCurrent(el, nearest);
    };

    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [count, reduceMotion]);

  return (
    <div
      ref={root}
      className={className ? `np-story-route-root ${className}` : "np-story-route-root"}
      data-active-stop="0"
      style={{ "--np-route-progress": reduceMotion ? "100%" : "0%" } as CSSProperties}
    >
      {children}
    </div>
  );
}
