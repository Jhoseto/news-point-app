"use client";

import { useEffect } from "react";
import { useReducedMotion } from "./reader-preferences";

/**
 * Drives the pointer-following spotlight on every `[data-spotlight]` card with a
 * single delegated listener. Writes the cursor position as CSS custom properties
 * so the effect stays pure CSS (and GPU-composited) per card.
 */
export function SpotlightField() {
  const reduceMotion = useReducedMotion();
  useEffect(() => {
    if (reduceMotion) return;
    let frame = 0;
    let target: HTMLElement | null = null;
    let clientX = 0;
    let clientY = 0;

    const paint = () => {
      frame = 0;
      if (!target) return;
      const rect = target.getBoundingClientRect();
      target.style.setProperty("--np-spot-x", `${clientX - rect.left}px`);
      target.style.setProperty("--np-spot-y", `${clientY - rect.top}px`);
    };

    const onMove = (event: PointerEvent) => {
      const element = (event.target as HTMLElement | null)?.closest?.("[data-spotlight]") as HTMLElement | null;
      target = element;
      if (!element) return;
      clientX = event.clientX;
      clientY = event.clientY;
      if (!frame) frame = requestAnimationFrame(paint);
    };

    document.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      document.removeEventListener("pointermove", onMove);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [reduceMotion]);

  return null;
}
