"use client";

import { useEffect, useState } from "react";
import type { ArticleSection } from "@/lib/article-reading";

export function ArticleRail({ sections }: { sections: ArticleSection[] }) {
  const [active, setActive] = useState(sections[0]?.id ?? "");

  useEffect(() => {
    if (sections.length < 2) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const threshold = Math.min(window.innerHeight * 0.35, 280);
      let current = sections[0]?.id ?? "";
      for (const section of sections) {
        const heading = document.getElementById(section.id);
        if (heading && heading.getBoundingClientRect().top <= threshold) current = section.id;
      }
      setActive(current);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    schedule();
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [sections]);

  if (sections.length < 2) return null;
  return (
    <nav aria-label="Раздели в статията" className="np-article-toc">
      <p className="np-article-rail-kicker">Навигация</p>
      <p className="np-article-rail-title">В тази статия</p>
      <ol>
        {sections.map((section, index) => (
          <li key={section.id}>
            <a href={`#${section.id}`} aria-current={active === section.id ? "location" : undefined} className={section.level === 3 ? "np-article-toc-sub" : undefined}>
              <span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
              {section.text}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
