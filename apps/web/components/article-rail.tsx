"use client";

import { useEffect, useState } from "react";
import type { ArticleSection } from "@/lib/article-reading";

export function ArticleRail({ sections }: { sections: ArticleSection[] }) {
  const [active, setActive] = useState(sections[0]?.id ?? "");
  const activeIndex = Math.max(0, sections.findIndex((section) => section.id === active));

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
    <nav aria-label="Съдържание на статията" className="np-article-toc">
      <details className="np-article-toc-disclosure">
        <summary>
          <span className="np-article-toc-summary-copy">
            <strong>Съдържание</strong>
            <small>{sections.length} раздела · бърза навигация</small>
          </span>
          <span className="np-article-toc-position">Раздел {activeIndex + 1} от {sections.length}</span>
          <span className="np-article-toc-toggle" aria-hidden="true" />
        </summary>
        <div className="np-article-toc-content">
          <ol>
            {sections.map((section, index) => (
              <li key={section.id}>
                <a href={`#${section.id}`} aria-current={active === section.id ? "location" : undefined} className={section.level === 3 ? "np-article-toc-sub" : undefined}>
                  <span className="np-article-toc-number" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                  <span className="np-article-toc-label">{section.text}</span>
                  {active === section.id ? <span className="np-article-toc-current">В момента</span> : null}
                </a>
              </li>
            ))}
          </ol>
        </div>
      </details>
    </nav>
  );
}
