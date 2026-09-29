"use client";

import { useEffect, useRef, useState } from "react";
import type { MediaOption } from "@/lib/articles";

/** Chooses from existing MediaAssets only (DEC-104); uploading comes with the media library. */
export function MediaPicker({
  media,
  selected,
  onSelect,
  multiple = false,
  onSelectMany,
  onClose,
}: {
  media: MediaOption[];
  selected: string | null;
  onSelect: (id: string) => void;
  multiple?: boolean;
  onSelectMany?: (ids: string[]) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState("");
  const [selectedMany, setSelectedMany] = useState<string[]>(selected ? [selected] : []);

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  const needle = query.trim().toLowerCase();
  const shown = needle ? media.filter((item) => item.alt.toLowerCase().includes(needle)) : media;

  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      aria-labelledby="media-heading"
      className="m-auto max-h-[85dvh] w-[min(56rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-line bg-surface p-0 shadow-2xl backdrop:bg-shell/60 backdrop:backdrop-blur-sm"
    >
      <div className="flex items-center gap-3 border-b border-line px-5 py-4">
        <h2 id="media-heading" className="text-lg font-extrabold text-ink">
          Медии
        </h2>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Търсене по описание" aria-label="Търсене по описание" className="np-input ml-auto max-w-64 py-2" />
        <button type="button" onClick={onClose} aria-label="Затвори" className="rounded-lg px-2 py-1 text-xl leading-none text-muted hover:bg-surface-2">
          ×
        </button>
      </div>
      <div className="max-h-[calc(85dvh-4.5rem)] overflow-y-auto p-5">
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {shown.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => multiple ? setSelectedMany((current) => current.includes(item.id) ? current.filter((id) => id !== item.id) : [...current, item.id]) : onSelect(item.id)}
                aria-pressed={multiple ? selectedMany.includes(item.id) : item.id === selected}
                className="group block w-full overflow-hidden rounded-xl border-2 border-transparent text-left transition hover:border-accent/50 aria-pressed:border-accent"
              >
                <img src={item.url} alt="" loading="lazy" className="aspect-[4/3] w-full bg-surface-2 object-cover" />
                <span className="line-clamp-2 px-1 py-1.5 text-xs text-muted">{item.alt || "Без описание"}</span>
              </button>
            </li>
          ))}
        </ul>
        {shown.length === 0 ? <p className="py-10 text-center text-sm text-muted">Няма намерени снимки.</p> : null}
      </div>
      {multiple ? <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-3"><span className="mr-auto text-xs text-muted">{selectedMany.length} избрани</span><button type="button" disabled={!selectedMany.length} onClick={() => onSelectMany?.(selectedMany)} className="np-btn np-btn-primary px-3 py-1.5 text-xs">Вмъкни в статията</button></div> : null}
    </dialog>
  );
}
