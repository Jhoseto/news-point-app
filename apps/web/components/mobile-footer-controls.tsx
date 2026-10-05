"use client";

import { useEffect, useRef } from "react";
import { useReducedMotion } from "./reader-preferences";

/** Small progressive enhancement; all footer content is visible without JS. */
export function MobileFooterControls() {
  const button = useRef<HTMLButtonElement>(null);
  const entered = useRef(false);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    const footer = button.current?.closest<HTMLElement>(".np-mobile-footer");
    if (!footer || reducedMotion || entered.current || !("IntersectionObserver" in window)) return;
    const mobile = window.matchMedia("(max-width: 63.999rem)");
    let observer: IntersectionObserver | undefined;
    const watch = () => {
      observer?.disconnect();
      if (!mobile.matches || entered.current) return;
      observer = new IntersectionObserver((entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        entered.current = true;
        footer.dataset.entered = "true";
        observer?.disconnect();
      }, { threshold: 0.1 });
      observer.observe(footer);
    };
    watch();
    mobile.addEventListener("change", watch);
    return () => { observer?.disconnect(); mobile.removeEventListener("change", watch); };
  }, [reducedMotion]);

  return (
    <button ref={button} type="button" className="np-mobile-footer-top" onClick={() => {
      window.scrollTo({ top: 0, behavior: reducedMotion ? "instant" : "smooth" });
    }}>
      Нагоре
      <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 19V5m-6 6 6-6 6 6" /></svg>
    </button>
  );
}
