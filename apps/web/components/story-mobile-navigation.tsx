"use client";

import { useEffect, useId, useRef } from "react";
import { BookIcon, ChevronRightIcon } from "./icons";

export type StoryMobileStop = { id: string; title: string; date: string | null };

/** Native disclosure and real anchors keep the chronology usable without JS. */
export function StoryMobileNavigation({ stops }: { stops: StoryMobileStop[] }) {
  const disclosure = useRef<HTMLDetailsElement>(null);
  const listId = useId();
  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      const node = disclosure.current;
      if (node?.open && event.target instanceof Node && !node.contains(event.target)) node.open = false;
    };
    const closeEscape = (event: KeyboardEvent) => {
      const node = disclosure.current;
      if (event.key !== "Escape" || !node?.open) return;
      node.open = false;
      node.querySelector("summary")?.focus();
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeEscape);
    };
  }, []);
  const last = stops.at(-1);
  if (!last) return null;
  return (
    <div className="np-story-mobile-navigation">
      <details ref={disclosure} className="np-story-mobile-picker">
        <summary aria-controls={listId}>
          <BookIcon width={18} height={18} />
          <span>Хронология <small>{stops.length}</small></span>
          <ChevronRightIcon className="np-story-mobile-chevron" width={14} height={14} />
        </summary>
        <nav id={listId} className="np-story-mobile-chapters" aria-label="Избери събитие от хронологията">
          <p>Всяка новина е част от историята</p>
          <ol>
            {stops.map((stop, index) => (
              <li key={stop.id}>
                <a href={`#np-stop-${stop.id}`} data-story-nav={index} onClick={() => { if (disclosure.current) disclosure.current.open = false; }}>
                  <span className="np-story-mobile-chapter-number">{String(index + 1).padStart(2, "0")}</span>
                  <span><small>{stop.date ?? "Събитие в темата"}</small><strong>{stop.title}</strong></span>
                </a>
              </li>
            ))}
          </ol>
        </nav>
      </details>
      <a className="np-story-mobile-end" href={`#np-stop-${last.id}`}>Към края <span aria-hidden="true">↓</span></a>
    </div>
  );
}
