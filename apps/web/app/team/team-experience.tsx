"use client";

import { useEffect, useRef, type ReactNode } from "react";

/** Motion enhances the server-rendered page; content never depends on it. */
export function TeamExperience({ children }: { children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const page = root.current;
    if (!page) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
    const animations = new Set<Animation>();
    const reveals = new IntersectionObserver((entries) => {
      entries.forEach(({ target, isIntersecting }) => {
        if (!isIntersecting) return;
        reveals.unobserve(target);
        if (reduced.matches) return;
        const element = target as HTMLElement;
        const portrait = element.classList.contains("np-team-member");
        const note = element.classList.contains("np-team-editorial-note") || element.classList.contains("np-team-mission-note");
        const heading = element.classList.contains("np-team-section-heading") || element.classList.contains("np-team-staff-heading");
        const row = portrait ? [...element.parentElement!.children].indexOf(element) % 4 : 0;
        const animation = element.animate([
          { opacity: portrait ? .15 : .25, translate: `${note ? "24px" : "0"} ${portrait ? "42px" : heading ? "26px" : "32px"}`, scale: portrait ? ".94" : note ? ".97" : "1", filter: "blur(4px)" },
          { opacity: 1, translate: "0 0", scale: "1", filter: "blur(0)" },
        ], { duration: portrait ? 920 : heading ? 760 : 800, delay: portrait ? row * 95 : 0, easing: "cubic-bezier(.16,1,.3,1)" });
        animations.add(animation);
        animation.onfinish = () => animations.delete(animation);
      });
    }, { threshold: .12 });
    page.querySelectorAll("[data-team-reveal]").forEach(el => reveals.observe(el));

    const index = page.querySelector<HTMLElement>(".np-team-index");
    const fan = page.querySelector<HTMLElement>(".np-team-fan");
    const hero = page.querySelector<HTMLElement>(".np-team-hero");
    const chapters = [...page.querySelectorAll<HTMLElement>("[data-team-chapter]")];
    let frame = 0;
    const updateChapter = () => {
      frame = 0;
      const top = index?.getBoundingClientRect().bottom ?? 180;
      let active = chapters[0]?.id;
      for (const chapter of chapters) {
        if (chapter.getBoundingClientRect().top <= top + 90) active = chapter.id;
      }
      index?.querySelectorAll("a").forEach(link => {
        if (link.hash === `#${active}`) link.setAttribute("aria-current", "location");
        else link.removeAttribute("aria-current");
      });
      const bounds = page.getBoundingClientRect();
      const scrollable = Math.max(1, bounds.height - window.innerHeight);
      index?.style.setProperty("--team-read-progress", String(Math.max(0, Math.min(1, -bounds.top / scrollable))));
      if (fan && hero && !reduced.matches) {
        const heroBounds = hero.getBoundingClientRect();
        const drift = Math.max(-28, Math.min(28, (window.innerHeight * .45 - heroBounds.top) * .045));
        fan.style.setProperty("--fan-scroll", `${drift.toFixed(1)}px`);
      }
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(updateChapter); };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    updateChapter();

    let pointerFrame = 0;
    const resetFan = () => { cancelAnimationFrame(pointerFrame); if (fan) { fan.style.setProperty("--fan-x", "0deg"); fan.style.setProperty("--fan-y", "0deg"); } };
    const moveFan = (event: PointerEvent) => {
      if (!fan || !finePointer.matches || reduced.matches) return;
      cancelAnimationFrame(pointerFrame);
      pointerFrame = requestAnimationFrame(() => {
        const bounds = fan.getBoundingClientRect();
        fan.style.setProperty("--fan-x", `${((event.clientX - bounds.left) / bounds.width - .5) * 5}deg`);
        fan.style.setProperty("--fan-y", `${((event.clientY - bounds.top) / bounds.height - .5) * -4}deg`);
      });
    };
    fan?.addEventListener("pointermove", moveFan);
    fan?.addEventListener("pointerleave", resetFan);

    const onClick = (event: MouseEvent) => {
      if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      const link = (event.target as Element).closest<HTMLAnchorElement>('a[href^="#"]');
      if (!link || !page.contains(link)) return;
      const target = document.getElementById(link.hash.slice(1));
      if (!target || !page.contains(target)) return;
      event.preventDefault();
      history.replaceState(history.state, "", link.hash);
      target.scrollIntoView({ behavior: reduced.matches ? "instant" : "smooth", block: "start" });
      target.setAttribute("tabindex", "-1");
      target.focus({ preventScroll: true });
    };
    page.addEventListener("click", onClick);
    const onMotionChange = () => { if (reduced.matches) { animations.forEach(animation => animation.cancel()); animations.clear(); resetFan(); fan?.style.setProperty("--fan-scroll", "0px"); } else onScroll(); };
    reduced.addEventListener("change", onMotionChange);
    return () => {
      reveals.disconnect();
      animations.forEach(animation => animation.cancel());
      cancelAnimationFrame(frame);
      cancelAnimationFrame(pointerFrame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      page.removeEventListener("click", onClick);
      fan?.removeEventListener("pointermove", moveFan);
      fan?.removeEventListener("pointerleave", resetFan);
      reduced.removeEventListener("change", onMotionChange);
    };
  }, []);

  return <div className="np-team" ref={root}>{children}</div>;
}
