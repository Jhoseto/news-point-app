"use client";

import { useEffect, useRef, useState } from "react";
import type { MediaOption } from "@/lib/articles";
import { browserMediaSrc } from "@/lib/media-src";
import { withBase } from "@/lib/paths";

type LibraryImage = MediaOption & { name: string };
type MediaYear = { year: string; months: string[] };

/** Chooses from existing MediaAssets only (DEC-104); uploading comes with the media library. */
export function MediaPicker({
  media: _media,
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
  const [mode, setMode] = useState<"library" | "upload">("library");
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [years, setYears] = useState<MediaYear[]>([]);
  const [openYear, setOpenYear] = useState("");
  const [folder, setFolder] = useState("");
  const [library, setLibrary] = useState<LibraryImage[]>([]);
  const [libraryTotal, setLibraryTotal] = useState(0);
  const [libraryLoading, setLibraryLoading] = useState(true);

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetch(withBase("/api/editor/media/"), { cache: "no-store" })
      .then((response) => response.ok ? response.json() as Promise<{ years: MediaYear[] }> : { years: [] })
      .then((result) => {
        if (cancelled) return;
        const nextYears = result.years ?? [];
        setYears(nextYears);
        const year = nextYears[0];
        if (!year) {
          setLibraryLoading(false);
          return;
        }
        setOpenYear(year.year);
        setFolder(`news/${year.year}/${year.months[0]}`);
      })
      .catch(() => { if (!cancelled) setLibraryLoading(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!folder) return;
    let cancelled = false;
    setLibraryLoading(true);
    void fetch(withBase(`/api/editor/media/?folder=${encodeURIComponent(folder)}`), { cache: "no-store" })
      .then((response) => response.ok ? response.json() as Promise<{ items: LibraryImage[]; total: number }> : { items: [], total: 0 })
      .then((result) => {
        if (cancelled) return;
        setLibrary(result.items ?? []);
        setLibraryTotal(result.total ?? 0);
      })
      .catch(() => { if (!cancelled) { setLibrary([]); setLibraryTotal(0); } })
      .finally(() => { if (!cancelled) setLibraryLoading(false); });
    return () => { cancelled = true; };
  }, [folder]);

  const needle = query.trim().toLowerCase();
  const shown = needle ? library.filter((item) => `${item.alt} ${item.name}`.toLowerCase().includes(needle)) : library;

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
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Търсене в папката" aria-label="Търсене в папката" className="np-input ml-auto max-w-64 py-2" />
        <button type="button" onClick={onClose} aria-label="Затвори" className="rounded-lg px-2 py-1 text-xl leading-none text-muted hover:bg-surface-2">
          ×
        </button>
      </div>
      <div className="flex gap-1 border-b border-line px-5 pt-3">
        <button type="button" onClick={() => setMode("library")} className={`rounded-t-lg px-3 py-2 text-xs font-bold ${mode === "library" ? "bg-surface-2 text-ink" : "text-muted"}`}>Медия библиотека</button>
        <button type="button" onClick={() => setMode("upload")} className={`rounded-t-lg px-3 py-2 text-xs font-bold ${mode === "upload" ? "bg-surface-2 text-ink" : "text-muted"}`}>Качи от устройството</button>
      </div>
      {mode === "upload" ? (
        <div className="m-5 rounded-xl border border-dashed border-accent/35 bg-accent/5 p-6 text-center">
          <input id="media-upload-files" type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple={multiple} onChange={(event) => setUploadFiles(Array.from(event.target.files ?? []))} className="mx-auto block max-w-full text-xs text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-accent file:px-3 file:py-2 file:font-bold file:text-white" />
          {uploadFiles.length ? <p className="mt-3 text-xs font-semibold text-ink">{uploadFiles.length} избрани файла</p> : <p className="mt-3 text-xs text-muted">Изберете една или повече снимки. Качването ще премине през оптимизация и проверка.</p>}
          <p className="mt-2 text-[0.6875rem] text-faint">Хранилището и оптимизиращият pipeline ще бъдат свързани в следващата миграция.</p>
        </div>
      ) : null}
      {mode === "library" ? (
        <div className="flex h-[min(62dvh,36rem)] min-h-0">
          <nav aria-label="Папки в хранилището" className="w-44 shrink-0 overflow-y-auto border-r border-line bg-surface-2/50 p-2 text-xs">
            <p className="px-2 py-1 text-[10px] font-bold tracking-wide text-faint uppercase">Хранилище</p>
            {years.map((year) => (
              <div key={year.year}>
                <button type="button" onClick={() => setOpenYear((current) => current === year.year ? "" : year.year)} className="flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left font-semibold text-ink hover:bg-surface" aria-expanded={openYear === year.year}>
                  <span aria-hidden="true" className="text-[10px] text-muted">{openYear === year.year ? "▾" : "▸"}</span>
                  {year.year}
                </button>
                {openYear === year.year ? (
                  <ul className="mb-1 ml-3 border-l border-line pl-1.5">
                    {year.months.map((month) => {
                      const path = `news/${year.year}/${month}`;
                      const active = folder === path;
                      return (
                        <li key={path}>
                          <button type="button" onClick={() => setFolder(path)} aria-current={active ? "true" : undefined} className={`block w-full rounded-md px-2 py-1 text-left tabular-nums ${active ? "bg-accent/10 font-bold text-accent" : "text-muted hover:bg-surface hover:text-ink"}`}>
                            {month}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
              </div>
            ))}
            {!years.length && !libraryLoading ? <p className="px-2 py-3 text-muted">Няма папки.</p> : null}
          </nav>
          <div className="min-w-0 flex-1 overflow-y-auto p-4">
            <p className="mb-3 text-[11px] text-muted">{folder || "Новини"} · {libraryTotal} снимки</p>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {shown.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => multiple ? setSelectedMany((current) => current.includes(item.id) ? current.filter((id) => id !== item.id) : [...current, item.id]) : onSelect(item.id)}
                    aria-pressed={multiple ? selectedMany.includes(item.id) : item.id === selected}
                    className="group block w-full overflow-hidden rounded-xl border-2 border-transparent text-left transition hover:border-accent/50 aria-pressed:border-accent"
                  >
                    <img src={browserMediaSrc(item.url)} alt="" loading="lazy" className="aspect-[4/3] w-full bg-surface-2 object-cover" />
                    <span className="line-clamp-2 px-1 py-1.5 text-xs text-muted">{item.alt || item.name}</span>
                  </button>
                </li>
              ))}
            </ul>
            {libraryLoading ? <p className="py-10 text-center text-sm text-muted">Зареждане на папката…</p> : null}
            {!libraryLoading && shown.length === 0 ? <p className="py-10 text-center text-sm text-muted">Няма снимки в тази папка.</p> : null}
          </div>
        </div>
      ) : null}
      {multiple ? <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-3"><span className="mr-auto text-xs text-muted">{selectedMany.length} избрани</span><button type="button" disabled={!selectedMany.length} onClick={() => onSelectMany?.(selectedMany)} className="np-btn np-btn-primary px-3 py-1.5 text-xs">Вмъкни в статията</button></div> : null}
    </dialog>
  );
}
