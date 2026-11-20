"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { attachSmoothScroll } from "@/lib/smooth-scroll";
import { useReducedMotion } from "./reader-preferences";

/** Enhance desktop wheels without replacing the document's native scroller. */
export function SmoothScroll() {
  const pathname = usePathname();
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    // This includes the OS setting and NewsPoint's existing reader preference.
    if (reducedMotion) return;
    const desktop = window.matchMedia("(min-width: 64rem) and (hover: hover) and (pointer: fine)");
    let detach: (() => void) | undefined;
    const sync = () => {
      detach?.();
      detach = desktop.matches ? attachSmoothScroll(window) : undefined;
    };
    sync();
    desktop.addEventListener("change", sync);
    return () => {
      desktop.removeEventListener("change", sync);
      detach?.();
    };
  }, [pathname, reducedMotion]);

  return null;
}
