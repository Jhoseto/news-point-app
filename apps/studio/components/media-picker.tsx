"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { MediaOption } from "@/lib/articles";
import { browserMediaSrc } from "@/lib/media-src";
import { withBase } from "@/lib/paths";
import { imageFilesFromDataTransfer } from "./media-picker-paste";

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
  const [uploadNames, setUploadNames] = useState<string[]>([]);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [renameBusy, setRenameBusy] = useState(false);
  const chosenItems = useRef(new Map<string, LibraryImage>());
  const uploadedItems = useRef<MediaOption[]>([]);
  const uploadBusy = useRef(false);
  const optimizeBusy = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const uploadPreviews = useMemo(() => uploadFiles.map((file) => ({ file, url: URL.createObjectURL(file) })), [uploadFiles]);
  useEffect(() => () => uploadPreviews.forEach(({ url }) => URL.revokeObjectURL(url)), [uploadPreviews]);

  const defaultUploadName = (file: File) => file.name.replace(/\.[^.]+$/, "").trim().slice(0, 240) || "Снимка";

  const setUploadFileList = (files: File[]) => {
    setUploadFiles(files);
    setUploadNames(files.map(defaultUploadName));
  };

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
    const missing = uploadFiles.findIndex((_, index) => !(uploadNames[index] ?? "").trim());
    if (missing >= 0) {
      setError(`Въведете име за снимка ${missing + 1}. По него ще се търси в архива.`);
      return;
    }
    uploadBusy.current = true;
    setUploading(true);
    setError("");
    let completed = 0;
    try {
      for (const [index, file] of uploadFiles.entries()) {
        const form = new FormData();
        form.append("file", file);
        form.append("alt", (uploadNames[index] ?? defaultUploadName(file)).trim().slice(0, 240));
        const response = await fetch(withBase("/api/editor/media/upload/"), { method: "POST", body: form });
        if (!response.ok) { const result = await response.json().catch(() => null); throw new Error(result?.error?.message ?? "Качването не беше успешно."); }
        const item = await response.json() as MediaOption;
        uploadedItems.current.push(item);
        completed++;
      }
      const items = uploadedItems.current;
      uploadedItems.current = [];
      setUploadFileList([]);
      if (multiple && onSelectMany) onSelectMany(items);
      else if (items[0]) (onUpload ?? onSelect)(items[0]);
    } catch (problem) {
      setUploadFiles((files) => files.slice(completed));
      setUploadNames((names) => names.slice(completed));
      setError(`${problem instanceof Error ? problem.message : "Качването не беше успешно."}${uploadedItems.current.length ? ` ${uploadedItems.current.length} снимки вече са качени; повторете само останалите.` : ""}`);
    } finally { uploadBusy.current = false; setUploading(false); }
  };

  const saveRename = async (item: LibraryImage) => {
    const next = renameDraft.trim().slice(0, 240);
    if (!next) { setError("Въведете име за снимката."); return; }
    if (next === (item.alt || item.name)) { setRenamingId(null); return; }
    setRenameBusy(true);
    setError("");
    try {
      const response = await fetch(withBase(`/api/editor/media/${item.id}/`), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ alt: next }),
      });
      const payload = await response.json().catch(() => null) as (LibraryImage & { error?: { message?: string } }) | null;
      if (!response.ok) throw new Error(payload?.error?.message ?? "Преименуването не успя.");
      const updated = { ...item, alt: payload?.alt ?? next, name: payload?.name ?? item.name };
      setLibrary((current) => current.map((row) => (row.id === item.id ? updated : row)));
      chosenItems.current.set(item.id, updated);
      setRenamingId(null);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "Преименуването не успя.");
    } finally {
      setRenameBusy(false);
    }
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
    void fetch(withBase("/api/editor/media/?years=1"), { cache: "no-store" })
      .then((response) => response.ok ? response.json() as Promise<{ years: MediaYear[] }> : { years: [] })
      .then((result) => {
        if (cancelled) return;
        const nextYears = result.years ?? [];
        setYears(nextYears);
        const year = nextYears[0];
        if (year) setOpenYear(year.year);
      })
      .catch(() => { if (!cancelled) setError("Папките не се заредиха. Затворете и отворете библиотеката отново."); })
      .finally(() => { if (!cancelled) setYearsLoading(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const searching = debouncedQuery.length >= 2;
    let cancelled = false;
    setLibraryLoading(true);
    setLibraryError("");
    if (!page) { setLibrary([]); setLibraryTotal(0); }
    const params = new URLSearchParams();
    params.set("offset", String(page * 80));
    if (searching) params.set("q", debouncedQuery);
    if (folder) params.set("folder", folder);
    else if (!searching) params.set("all", "1");
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

  const searching = debouncedQuery.length >= 2;
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

  const queueUploadFiles = (files: File[]) => {
    if (!files.length || uploading) return;
    setMode("upload");
    setUploadFileList(multiple ? [...uploadFiles, ...files] : files.slice(0, 1));
    setError("");
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
      onPaste={(event) => {
        if (uploading) return;
        const files = imageFilesFromDataTransfer(event.clipboardData);
        if (!files.length) return;
        event.preventDefault();
        queueUploadFiles(files);
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && !uploading) onClose();
      }}
      aria-labelledby="media-heading"
      className="m-auto flex max-h-[85dvh] w-[min(56rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-line bg-surface p-0 shadow-2xl backdrop:bg-shell/60 backdrop:backdrop-blur-sm"
    >
      <div className="flex shrink-0 items-center gap-3 border-b border-line px-5 py-4">
        <h2 id="media-heading" className="text-lg font-extrabold text-ink">
          Медии
        </h2>
        <input data-help="Търси снимки по име в избраната папка или целия архив. Въведете поне два знака."
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
      <div className="flex shrink-0 gap-1 border-b border-line px-5 pt-3">
        <button data-help="Отваря съществуващите снимки в библиотеката." type="button" disabled={uploading} onClick={() => setMode("library")} className={`rounded-t-lg px-3 py-2 text-xs font-bold ${mode === "library" ? "bg-surface-2 text-ink" : "text-muted"}`}>Медия библиотека</button>
        <button data-help="Отваря качването на нови снимки от вашето устройство." type="button" disabled={uploading} onClick={() => setMode("upload")} className={`rounded-t-lg px-3 py-2 text-xs font-bold ${mode === "upload" ? "bg-surface-2 text-ink" : "text-muted"}`}>Качи от устройството</button>
      </div>
      {error || (mode === "library" && libraryError) ? <p role="alert" className="shrink-0 px-5 py-3 text-sm text-danger">{error || libraryError}</p> : null}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {mode === "upload" ? (
        <div
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5"
          onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; }}
          onDrop={(event) => {
            event.preventDefault();
            if (uploading) return;
            queueUploadFiles(imageFilesFromDataTransfer(event.dataTransfer));
          }}
        >
        <div className="rounded-xl border border-dashed border-accent/35 bg-accent/5 p-6 text-center">
          <input data-help="Качва нов файл в медийната библиотека. След качване можете да го изберете за материала." id="media-upload-files" aria-label="Файлове за качване" disabled={uploading} type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple={multiple} onChange={(event) => { setUploadFileList(Array.from(event.target.files ?? [])); setError(""); }} className="mx-auto block max-w-full text-xs text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-accent file:px-3 file:py-2 file:font-bold file:text-white" />
          {uploadFiles.length ? <p className="mt-3 text-xs font-semibold text-ink">{uploadFiles.length} избрани файла · задайте име за търсене в архива</p> : <p className="mt-3 text-xs text-muted">Изберете снимки, плъзнете ги тук или поставете с Ctrl+V / ⌘V. Качването минава през оптимизация и проверка.</p>}
          {uploadPreviews.length ? (
            <div className="mt-4 grid grid-cols-1 gap-3 text-left sm:grid-cols-2">
              {uploadPreviews.map(({ file, url }, index) => (
                <div key={`${file.name}-${file.lastModified}-${index}`} className="group relative overflow-hidden rounded-xl border border-line bg-surface">
                  <img src={url} alt={file.name} className="aspect-[4/3] w-full object-cover" />
                  <button
                    type="button"
                    disabled={uploading}
                    onClick={() => {
                      setUploadFiles((current) => current.filter((_, itemIndex) => itemIndex !== index));
                      setUploadNames((current) => current.filter((_, itemIndex) => itemIndex !== index));
                    }}
                    className="absolute top-1.5 right-1.5 rounded-full bg-shell/80 px-2 py-0.5 text-xs font-bold text-white opacity-0 transition group-hover:opacity-100"
                    aria-label={`Премахни ${file.name}`}
                  >
                    ×
                  </button>
                  <div className="space-y-1 p-2">
                    <label className="block text-[10px] font-semibold tracking-wide text-faint uppercase">
                      Име в архива
                      <input data-help="Името, с което снимката ще се записва и намира в библиотеката."
                        value={uploadNames[index] ?? ""}
                        disabled={uploading}
                        maxLength={240}
                        onChange={(event) => setUploadNames((current) => current.map((name, itemIndex) => (itemIndex === index ? event.target.value : name)))}
                        placeholder={defaultUploadName(file)}
                        className="np-input mt-1 w-full py-1.5 text-xs"
                      />
                    </label>
                    <p className="truncate text-[0.625rem] text-muted">{file.name}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
          <p className="mt-2 text-[0.6875rem] text-faint">Файлът се оптимизира на сървъра и се добавя в медийната библиотека с това име (търсене в архива).</p>
          {uploadedItems.current.length && !uploading ? <button data-help="Добавя избраната снимка или снимки в материала." type="button" className="np-btn np-btn-secondary mt-4 mr-2" onClick={() => { const items = uploadedItems.current; uploadedItems.current = []; if (multiple && onSelectMany) onSelectMany(items); else if (items[0]) (onUpload ?? onSelect)(items[0]); }}>Вмъкни вече качените</button> : null}
          <button data-help="Качва и оптимизира избраните снимки, след което ги добавя към материала." type="button" disabled={!uploadFiles.length || uploading} onClick={() => void upload()} className="np-btn np-btn-primary mt-4 px-4 py-2 text-xs">{uploading ? "Качване…" : "Качи и избери"}</button>
        </div>
        </div>
      ) : null}
      {mode === "library" ? (
        <div className="flex min-h-0 flex-1">
          <nav aria-label="Папки в хранилището" className="w-44 shrink-0 overflow-y-auto border-r border-line bg-surface-2/50 p-2 text-xs">
            <p className="px-2 py-1 text-[10px] font-bold tracking-wide text-faint uppercase">Хранилище</p>
            <button data-help="Показва снимките от всички години и месеци."
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
                          <button data-help="Показва снимките само от този месец." type="button" onClick={() => selectFolder(path)} aria-current={active ? "true" : undefined} className={`block w-full rounded-md px-2 py-1 text-left tabular-nums ${active ? "bg-accent/10 font-bold text-accent" : "text-muted hover:bg-surface hover:text-ink"}`}>
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
                <li key={item.id} className="overflow-hidden rounded-xl border-2 border-transparent transition has-[[aria-pressed=true]]:border-accent hover:border-accent/50">
                  <button data-help="Избира снимката за материала. При избор на няколко снимки потвърдете с бутона за вмъкване."
                    type="button"
                    onClick={() => pick(item)}
                    onDoubleClick={(event) => {
                      event.preventDefault();
                      pickOne(item);
                    }}
                    disabled={optimizing || libraryLoading || queryPending || renameBusy}
                    aria-pressed={multiple ? selectedMany.includes(item.id) : item.id === selected}
                    className="group block w-full text-left"
                  >
                    <img src={browserMediaSrc(item.url)} alt="" loading="lazy" className="aspect-[4/3] w-full bg-surface-2 object-cover" />
                  </button>
                  {renamingId === item.id ? (
                    <div className="flex flex-col gap-1 p-1.5" onClick={(event) => event.stopPropagation()}>
                      <input data-help="Името за намиране на тази снимка в библиотеката."
                        value={renameDraft}
                        disabled={renameBusy}
                        maxLength={240}
                        autoFocus
                        aria-label="Ново име на снимката"
                        onChange={(event) => setRenameDraft(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") { event.preventDefault(); void saveRename(item); }
                          if (event.key === "Escape") setRenamingId(null);
                        }}
                        className="np-input w-full py-1 text-xs"
                      />
                      <div className="flex gap-1">
                        <button data-help="Записва новото име на тази снимка в библиотеката." type="button" disabled={renameBusy} onClick={() => void saveRename(item)} className="np-btn np-btn-primary h-6 flex-1 px-1 text-[10px]">{renameBusy ? "…" : "Запази"}</button>
                        <button type="button" disabled={renameBusy} onClick={() => setRenamingId(null)} className="np-btn np-btn-secondary h-6 px-1 text-[10px]">Отказ</button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start gap-1 px-1 py-1.5">
                      <span className="line-clamp-2 min-w-0 flex-1 text-xs text-muted">{item.alt || item.name}</span>
                      <button data-help="Сменя името на снимката за търсене в библиотеката."
                        type="button"
                        disabled={optimizing || renameBusy}
                        aria-label={`Преименувай ${item.alt || item.name}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          setRenamingId(item.id);
                          setRenameDraft(item.alt || item.name);
                          setError("");
                        }}
                        className="shrink-0 rounded px-1 text-[10px] font-bold text-accent hover:bg-accent/10"
                      >
                        Име
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
            {!libraryLoading && libraryError ? <button type="button" className="np-btn np-btn-secondary mt-4" onClick={() => setLibraryRetry(current => current + 1)}>Повтори зареждането</button> : null}
            {!libraryLoading && !libraryError && library.length < libraryTotal ? <button type="button" className="np-btn np-btn-secondary mt-4" onClick={() => setPage(current => current + 1)}>Покажи още снимки</button> : null}
            {optimizing ? <p className="py-4 text-center text-sm font-semibold text-accent">Оптимизация на снимката за сайта…</p> : null}
            {libraryLoading ? <p className="py-10 text-center text-sm text-muted">{searching ? "Търсене…" : folder ? "Зареждане на папката…" : "Зареждане на архива…"}</p> : null}
            {!libraryLoading && !libraryError && library.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted">{searching ? "Няма съвпадения." : folder ? "Няма снимки в тази папка." : "Архивът е празен."}</p>
            ) : null}
          </div>
        </div>
      ) : null}
      </div>
      {multiple ? (
        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-line px-5 py-3">
          <span className="mr-auto text-xs text-muted">{selectedMany.length} избрани · двоен клик добавя веднага</span>
          <button data-help="Вмъква избраните снимки заедно в материала."
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
