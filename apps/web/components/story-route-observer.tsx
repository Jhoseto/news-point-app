"use client";

import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { useReducedMotion } from "./reader-preferences";

function markCurrent(root: HTMLElement, index: number, mobile = false) {
  root.dataset.activeStop = String(index);
  root.querySelectorAll<HTMLElement>("[data-story-stop]").forEach((node, i) => {
    node.toggleAttribute("data-current", i === index);
  });
  root.querySelectorAll<HTMLElement>("[data-story-nav]").forEach((node) => {
    const current = Number(node.dataset.storyNav) === index;
    node.toggleAttribute("data-current", current);
    if (mobile && node.closest(".np-story-mobile-navigation")) {
      if (current) node.setAttribute("aria-current", "location");
      else node.removeAttribute("aria-current");
    }
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
  mobile = false,
}: {
  children: ReactNode;
  count: number;
  className?: string;
  mobile?: boolean;
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
      if (reduceMotion && !mobile) {
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
      el.style.setProperty("--np-route-progress", reduceMotion ? "100%" : `${progress * 100}%`);
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
      markCurrent(el, nearest, mobile);
    };

    update();
    let frame = 0;
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(() => { frame = 0; update(); });
    };
    const onMove = mobile ? schedule : update;
    window.addEventListener("scroll", onMove, { passive: true });
    window.addEventListener("resize", onMove);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onMove);
      window.removeEventListener("resize", onMove);
    };
  }, [count, reduceMotion, mobile]);

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
