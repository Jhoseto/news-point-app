"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  onUpload,
  onClose,
}: {
  media: MediaOption[];
  selected: string | null;
  /** Receives the picked MediaOption so callers can read `url` directly —
   * `media` prop and the picked item come from different fetches, so looking
   * up the picked id in `media` would silently miss in the common case. */
  onSelect: (item: MediaOption) => void;
  multiple?: boolean;
  onSelectMany?: (items: MediaOption[]) => void;
  onUpload?: (item: MediaOption) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selectedMany, setSelectedMany] = useState<string[]>(selected ? [selected] : []);
  const [mode, setMode] = useState<"library" | "upload">("library");
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const libraryTouched = useRef(false);
  const [yearsLoading, setYearsLoading] = useState(true);
  const [years, setYears] = useState<MediaYear[]>([]);
  const [openYear, setOpenYear] = useState("");
  const [folder, setFolder] = useState("");
  const [library, setLibrary] = useState<LibraryImage[]>([]);
  const [page, setPage] = useState(0);
  const [libraryTotal, setLibraryTotal] = useState(0);
  const [libraryLoading, setLibraryLoading] = useState(true);
  const [libraryError, setLibraryError] = useState("");
  const [libraryRetry, setLibraryRetry] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [error, setError] = useState("");
  const chosenItems = useRef(new Map<string, LibraryImage>());
  const uploadedItems = useRef<MediaOption[]>([]);
  const uploadBusy = useRef(false);
  const optimizeBusy = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const uploadPreviews = useMemo(() => uploadFiles.map((file) => ({ file, url: URL.createObjectURL(file) })), [uploadFiles]);
  useEffect(() => () => uploadPreviews.forEach(({ url }) => URL.revokeObjectURL(url)), [uploadPreviews]);

  /** Archive picks go through the same width-ladder pipeline as new uploads. */
  const optimizeArchiveItem = async (item: LibraryImage): Promise<MediaOption> => {
    try {
      const response = await fetch(withBase("/api/editor/media/optimize/"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: item.id }),
      });
      if (!response.ok) { const failure = await response.json().catch(() => null); throw new Error(failure?.error?.message ?? "Оптимизацията не успя. Повторете избора."); }
      const result = (await response.json()) as MediaOption & { variants?: unknown };
      return { ...item, ...result, id: result.id || item.id, url: result.url || item.url, alt: result.alt ?? item.alt };
    } catch (problem) { throw problem instanceof Error ? problem : new Error("Оптимизацията не успя. Повторете избора."); }
  };

  const upload = async () => {
    if (!uploadFiles.length || uploadBusy.current) return;
    uploadBusy.current = true;
    setUploading(true);
    setError("");
    let completed = 0;
    try {
      for (const file of uploadFiles) {
        const form = new FormData(); form.append("file", file); form.append("alt", file.name.replace(/\.[^.]+$/, ""));
        const response = await fetch(withBase("/api/editor/media/upload/"), { method: "POST", body: form });
        if (!response.ok) { const result = await response.json().catch(() => null); throw new Error(result?.error?.message ?? "Качването не беше успешно."); }
        const item = await response.json() as MediaOption;
        uploadedItems.current.push(item);
        completed++;
      }
      const items = uploadedItems.current;
      uploadedItems.current = [];
      setUploadFiles([]);
      if (multiple && onSelectMany) onSelectMany(items);
      else if (items[0]) (onUpload ?? onSelect)(items[0]);
    } catch (problem) {
      setUploadFiles(files => files.slice(completed));
      setError(`${problem instanceof Error ? problem.message : "Качването не беше успешно."}${uploadedItems.current.length ? ` ${uploadedItems.current.length} снимки вече са качени; повторете само останалите.` : ""}`);
    } finally { uploadBusy.current = false; setUploading(false); }
  };

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => (setPage(0), setDebouncedQuery(query.trim())), 250);
    return () => window.clearTimeout(timer);
  }, [query]);

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
        if (!libraryTouched.current) setFolder(`news/${year.year}/${year.months[0]}`);
      })
      .catch(() => { if (!cancelled) { setLibraryLoading(false); setError("Папките не се заредиха. Затворете и отворете библиотеката отново."); } })
      .finally(() => { if (!cancelled) setYearsLoading(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const searching = debouncedQuery.length >= 2;
    if (!searching && !folder) {
      setLibrary([]);
      setLibraryTotal(0);
      setLibraryLoading(false);
      return;
    }
    let cancelled = false;
    setLibraryLoading(true);
    setLibraryError("");
    if (!page) { setLibrary([]); setLibraryTotal(0); }
    const params = new URLSearchParams();
    if (folder) params.set("folder", folder);
    params.set("offset", String(page * 80));
    if (searching) params.set("q", debouncedQuery);
    void fetch(withBase(`/api/editor/media/?${params}`), { cache: "no-store" })
      .then(async response => { if (!response.ok) throw new Error(response.status === 401 ? "Сесията изтече. Влезте отново." : "Библиотеката не се зареди. Опитайте отново."); return response.json() as Promise<{ items: LibraryImage[]; total: number }>; })
      .then((result) => {
        if (cancelled) return;
        setLibrary(current => page ? [...current, ...(result.items ?? [])] : result.items ?? []);
        setLibraryTotal(result.total ?? 0);
      })
      .catch(problem => { if (!cancelled) { if (!page) { setLibrary([]); setLibraryTotal(0); } setLibraryError(problem instanceof Error ? problem.message : "Библиотеката не се зареди."); } })
      .finally(() => { if (!cancelled) setLibraryLoading(false); });
    return () => { cancelled = true; };
  }, [folder, debouncedQuery, page, libraryRetry]);

  const searchingAll = !folder && debouncedQuery.length >= 2;
  const searchHint = folder ? "Търсене в папката" : "Търсене в целия архив";
  const queryPending = query.trim() !== debouncedQuery;
  const selectFolder = (nextFolder: string) => {
    libraryTouched.current = true;
    if (nextFolder === folder && page === 0) return;
    setLibrary([]); setLibraryTotal(0); setLibraryLoading(true);
    setPage(0); setFolder(nextFolder);
  };

  const pickOne = (item: LibraryImage) => {
    if (optimizeBusy.current || libraryLoading || queryPending) return;
    optimizeBusy.current = true;
    setError(""); setOptimizing(true);
    void optimizeArchiveItem(item)
      .then(optimized => { if (mounted.current) onSelect(optimized); })
      .catch(problem => { if (mounted.current) setError(problem instanceof Error ? problem.message : "Изборът не успя."); })
      .finally(() => { optimizeBusy.current = false; if (mounted.current) setOptimizing(false); });
  };

  const pick = (item: LibraryImage) => {
    if (multiple) {
      chosenItems.current.set(item.id, item);
      setSelectedMany((current) => current.includes(item.id) ? current.filter((id) => id !== item.id) : [...current, item.id]);
      return;
    }
    pickOne(item);
  };

  const insertMany = () => {
    if (!onSelectMany || !selectedMany.length || optimizeBusy.current) return;
    const chosen = selectedMany.map(id => chosenItems.current.get(id)).filter((item): item is LibraryImage => !!item);
    optimizeBusy.current = true;
    setError(""); setOptimizing(true);
    void Promise.all(chosen.map((item) => optimizeArchiveItem(item)))
      .then(items => { if (mounted.current) onSelectMany(items); })
      .catch(problem => { if (mounted.current) setError(problem instanceof Error ? problem.message : "Изборът не успя."); })
      .finally(() => { optimizeBusy.current = false; if (mounted.current) setOptimizing(false); });
  };

  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      onCancel={event => { if (uploading) event.preventDefault(); }}
      onClick={(event) => {
        if (event.target === event.currentTarget && !uploading) onClose();
      }}
      aria-labelledby="media-heading"
      className="m-auto max-h-[85dvh] w-[min(56rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-line bg-surface p-0 shadow-2xl backdrop:bg-shell/60 backdrop:backdrop-blur-sm"
    >
      <div className="flex items-center gap-3 border-b border-line px-5 py-4">
        <h2 id="media-heading" className="text-lg font-extrabold text-ink">
          Медии
        </h2>
        <input
          value={query}
          onChange={(event) => { libraryTouched.current = true; setQuery(event.target.value); }}
          placeholder={folder ? "Търсене в папката (мин. 2 знака)" : "Търсене в целия архив (мин. 2 знака)"}
          aria-label={searchHint}
          className="np-input ml-auto max-w-72 py-2"
        />
        <button type="button" disabled={uploading} onClick={onClose} aria-label="Затвори" className="rounded-lg px-2 py-1 text-xl leading-none text-muted hover:bg-surface-2">
          ×
        </button>
      </div>
      <div className="flex gap-1 border-b border-line px-5 pt-3">
        <button type="button" disabled={uploading} onClick={() => setMode("library")} className={`rounded-t-lg px-3 py-2 text-xs font-bold ${mode === "library" ? "bg-surface-2 text-ink" : "text-muted"}`}>Медия библиотека</button>
        <button type="button" disabled={uploading} onClick={() => setMode("upload")} className={`rounded-t-lg px-3 py-2 text-xs font-bold ${mode === "upload" ? "bg-surface-2 text-ink" : "text-muted"}`}>Качи от устройството</button>
      </div>
      {error || (mode === "library" && libraryError) ? <p role="alert" className="px-5 py-3 text-sm text-danger">{error || libraryError}</p> : null}
      {mode === "upload" ? (
        <div className="m-5 rounded-xl border border-dashed border-accent/35 bg-accent/5 p-6 text-center">
          <input id="media-upload-files" aria-label="Файлове за качване" disabled={uploading} type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple={multiple} onChange={(event) => { setUploadFiles(Array.from(event.target.files ?? [])); setError(""); }} className="mx-auto block max-w-full text-xs text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-accent file:px-3 file:py-2 file:font-bold file:text-white" />
          {uploadFiles.length ? <p className="mt-3 text-xs font-semibold text-ink">{uploadFiles.length} избрани файла</p> : <p className="mt-3 text-xs text-muted">Изберете една или повече снимки. Качването ще премине през оптимизация и проверка.</p>}
          {uploadPreviews.length ? <div className="mt-4 grid grid-cols-2 gap-3 text-left sm:grid-cols-4">{uploadPreviews.map(({ file, url }, index) => <div key={`${file.name}-${file.lastModified}`} className="group relative overflow-hidden rounded-xl border border-line bg-surface"><img src={url} alt={file.name} className="aspect-[4/3] w-full object-cover" /><button type="button" disabled={uploading} onClick={() => setUploadFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))} className="absolute top-1.5 right-1.5 rounded-full bg-shell/80 px-2 py-0.5 text-xs font-bold text-white opacity-0 transition group-hover:opacity-100" aria-label={`Премахни ${file.name}`}>×</button><span className="block truncate px-2 py-1.5 text-[0.6875rem] text-muted">{file.name}</span></div>)}</div> : null}
          <p className="mt-2 text-[0.6875rem] text-faint">Файлът се оптимизира на сървъра и се добавя в медийната библиотека.</p>
          {uploadedItems.current.length && !uploading ? <button type="button" className="np-btn np-btn-secondary mt-4 mr-2" onClick={() => { const items = uploadedItems.current; uploadedItems.current = []; if (multiple && onSelectMany) onSelectMany(items); else if (items[0]) (onUpload ?? onSelect)(items[0]); }}>Вмъкни вече качените</button> : null}
          <button type="button" disabled={!uploadFiles.length || uploading} onClick={() => void upload()} className="np-btn np-btn-primary mt-4 px-4 py-2 text-xs">{uploading ? "Качване…" : "Качи и избери"}</button>
        </div>
      ) : null}
      {mode === "library" ? (
        <div className="flex h-[min(62dvh,36rem)] min-h-0">
          <nav aria-label="Папки в хранилището" className="w-44 shrink-0 overflow-y-auto border-r border-line bg-surface-2/50 p-2 text-xs">
            <p className="px-2 py-1 text-[10px] font-bold tracking-wide text-faint uppercase">Хранилище</p>
            <button
              type="button"
              onClick={() => selectFolder("")}
              aria-current={!folder ? "true" : undefined}
              className={`mb-1 flex w-full items-center rounded-md px-2 py-1.5 text-left font-semibold ${!folder ? "bg-accent/10 text-accent" : "text-ink hover:bg-surface"}`}
            >
              Целият архив
            </button>
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
                          <button type="button" onClick={() => selectFolder(path)} aria-current={active ? "true" : undefined} className={`block w-full rounded-md px-2 py-1 text-left tabular-nums ${active ? "bg-accent/10 font-bold text-accent" : "text-muted hover:bg-surface hover:text-ink"}`}>
                            {month}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
              </div>
            ))}
            {yearsLoading ? <p className="px-2 py-3 text-muted">Зареждане на папките…</p> : null}
            {!years.length && !yearsLoading ? <p className="px-2 py-3 text-muted">Няма папки.</p> : null}
          </nav>
          <div className="min-w-0 flex-1 overflow-y-auto p-4">
            <p className="mb-3 text-[11px] text-muted">
              {folder || "Целият архив"}
              {debouncedQuery.length >= 2 ? ` · търсене „${debouncedQuery}"` : ""}
              {" · "}
              {libraryLoading && !library.length ? "Зареждане…" : `${libraryTotal} снимки`}
            </p>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {library.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => pick(item)}
                    onDoubleClick={(event) => {
                      event.preventDefault();
                      pickOne(item);
                    }}
                    title="Двоен клик добавя снимката (с оптимизация)"
                    disabled={optimizing || libraryLoading || queryPending}
                    aria-pressed={multiple ? selectedMany.includes(item.id) : item.id === selected}
                    className="group block w-full overflow-hidden rounded-xl border-2 border-transparent text-left transition hover:border-accent/50 aria-pressed:border-accent"
                  >
                    <img src={browserMediaSrc(item.url)} alt="" loading="lazy" className="aspect-[4/3] w-full bg-surface-2 object-cover" />
                    <span className="line-clamp-2 px-1 py-1.5 text-xs text-muted">{item.alt || item.name}</span>
                  </button>
                </li>
              ))}
            </ul>
            {!libraryLoading && libraryError ? <button type="button" className="np-btn np-btn-secondary mt-4" onClick={() => setLibraryRetry(current => current + 1)}>Повтори зареждането</button> : null}
            {!libraryLoading && !libraryError && library.length < libraryTotal ? <button type="button" className="np-btn np-btn-secondary mt-4" onClick={() => setPage(current => current + 1)}>Покажи още снимки</button> : null}
            {optimizing ? <p className="py-4 text-center text-sm font-semibold text-accent">Оптимизация на снимката за сайта…</p> : null}
            {libraryLoading ? <p className="py-10 text-center text-sm text-muted">{searchingAll ? "Търсене в архива…" : "Зареждане на папката…"}</p> : null}
            {!libraryLoading && !folder && debouncedQuery.length < 2 ? (
              <p className="py-10 text-center text-sm text-muted">Изберете папка или въведете поне 2 знака за търсене в целия архив.</p>
            ) : null}
            {!libraryLoading && (folder || debouncedQuery.length >= 2) && library.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted">{debouncedQuery.length >= 2 ? "Няма съвпадения." : "Няма снимки в тази папка."}</p>
            ) : null}
          </div>
        </div>
      ) : null}
      {multiple ? (
        <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-3">
          <span className="mr-auto text-xs text-muted">{selectedMany.length} избрани · двоен клик добавя веднага</span>
          <button
            type="button"
            disabled={!selectedMany.length || optimizing || uploading || libraryLoading || queryPending || mode !== "library"}
            onClick={() => insertMany()}
            className="np-btn np-btn-primary px-3 py-1.5 text-xs"
          >
            {optimizing ? "Оптимизация…" : "Вмъкни в статията"}
          </button>
        </div>
      ) : null}
    </dialog>
  );
}
