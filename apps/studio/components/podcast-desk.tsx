"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { withBase } from "@/lib/paths";
import { uploadResumable, cancelResumableUpload } from "@/lib/resumable-upload";
import { PODCAST_AUDIO_ACCEPT } from "@newspoint/content";
import {
  bytesText,
  clock,
  filterEpisodes,
  isEditorDirty,
  isNewEpisodeValid,
  longDate,
  shortDate,
  sortByPublishedAtDesc,
} from "./podcast-desk-utils";
import type { Category, EpisodeFilter, StudioEpisode } from "./podcast-desk-types";
import { PodcastSocialShare } from "./podcast-social-share";
import "./podcast-desk.css";

export type { Category, StudioEpisode };

type Tab = "editor" | "new" | "empty";

const sortedByDate = sortByPublishedAtDesc;

export function PodcastDesk({ initial, categories, webUrl }: { initial: StudioEpisode[]; categories: Category[]; webUrl: string }) {
  const [episodes, setEpisodes] = useState(initial);
  const [filter, setFilter] = useState<"all" | "published" | "draft">("all");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(initial[0]?.id ?? null);
  const [tab, setTab] = useState<Tab>(initial.length === 0 ? "empty" : "editor");

  const filtered = useMemo(
    () => sortedByDate(filterEpisodes(episodes, filter, query)),
    [episodes, filter, query],
  );

  const current = episodes.find((episode) => episode.id === selectedId) ?? null;
  const counts = useMemo(() => ({
    all: episodes.length,
    published: episodes.filter((episode) => episode.status === "published").length,
    draft: episodes.filter((episode) => episode.status === "draft").length,
  }), [episodes]);

  function openEditor(id: string) {
    setSelectedId(id);
    setTab("editor");
  }

  function openNew() {
    setTab("new");
  }

  return (
    <div className="np-podcast-desk">
      <aside className="np-podcast-sidebar">
        <div className="np-podcast-sidebar-head">
          <div className="np-podcast-counter">
            <span className="np-podcast-counter-num">{counts.all}</span>
            <span className="np-podcast-counter-label">{counts.all === 1 ? "епизод" : "епизода"}</span>
          </div>
          <button data-help="Започва нов епизод с аудио, заглавие, резюме и обложка." type="button" onClick={openNew} className="np-podcast-new-btn" aria-label="Нов епизод">
            <svg viewBox="0 0 24 24" width={14} height={14} aria-hidden="true"><path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" /></svg>
            Нов епизод
          </button>
        </div>

        <div className="np-podcast-search">
          <svg viewBox="0 0 24 24" width={14} height={14} aria-hidden="true"><circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" strokeWidth={2} /><path d="m20 20-4.2-4.2" stroke="currentColor" strokeWidth={2} strokeLinecap="round" /></svg>
          <input data-help="Търси подкаст епизоди в списъка."
            type="search"
            placeholder="Търсене…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="np-podcast-search-input"
            aria-label="Търсене в епизодите"
          />
        </div>

        <div className="np-podcast-chips" role="tablist" aria-label="Филтър по статус">
          {([
            ["all", "Всички", counts.all],
            ["published", "На сайта", counts.published],
            ["draft", "Чернови", counts.draft],
          ] as const).map(([value, label, count]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={filter === value}
              onClick={() => setFilter(value)}
              className="np-podcast-chip"
            >
              {label}
              <span className="np-podcast-chip-count">{count}</span>
            </button>
          ))}
        </div>

        {filtered.length > 0 ? (
          <ul className="np-podcast-list" role="listbox" aria-label="Епизоди">
            {filtered.map((episode) => (
              <li key={episode.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={episode.id === selectedId && tab === "editor"}
                  onClick={() => openEditor(episode.id)}
                  className="np-podcast-list-item"
                >
                  <img
                    src={`${webUrl}/media/${episode.coverKey}`}
                    alt=""
                    className="np-podcast-list-cover"
                    loading="lazy"
                  />
                  <span className="np-podcast-list-body">
                    <span className="np-podcast-list-title">{episode.title}</span>
                    <span className="np-podcast-list-meta">
                      <span className={`np-podcast-status np-podcast-status--${episode.status}`}>
                        <span className="np-podcast-status-dot" />
                        {episode.status === "published" ? "На сайта" : "Чернова"}
                      </span>
                      <span>·</span>
                      <span>{clock(episode.durationSec)}</span>
                      <span>·</span>
                      <span>{shortDate(episode.publishedAt)}</span>
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="np-podcast-empty">
            {query
              ? <p>Нищо не съвпада с „{query.trim()}".</p>
              : filter === "draft"
                ? <p>Няма чернови. Записва се в „Чернова" при създаване без публикуване.</p>
                : <p>Все още няма епизоди. Започнете с „Нов епизод".</p>}
          </div>
        )}
      </aside>

      <div className="np-podcast-main">
        {tab === "empty" ? <EmptyState onCreate={openNew} /> : null}
        {tab === "new" ? (
          <NewEpisodeForm
            categories={categories}
            onCreated={(episode) => {
              setEpisodes((rows) => [episode, ...rows]);
              setSelectedId(episode.id);
              setFilter("all");
              setQuery("");
              setTab("editor");
            }}
            onCancel={episodes.length > 0 ? () => setTab(initial.length === 0 ? "empty" : "editor") : () => undefined}
          />
        ) : null}
        {tab === "editor" && current ? (
          <EpisodeEditor
            key={current.id}
            episode={current}
            categories={categories}
            webUrl={webUrl}
            onPatch={(patch) => {
              setEpisodes((rows) => rows.map((row) => (row.id === current.id ? { ...row, ...patch } : row)));
            }}
            onRemove={() => {
              const next = episodes.filter((row) => row.id !== current.id);
              setEpisodes(next);
              setSelectedId(next[0]?.id ?? null);
              setTab(next.length === 0 ? "empty" : "editor");
            }}
          />
        ) : null}
      </div>
    </div>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="np-podcast-empty-state">
      <div className="np-podcast-empty-illu">
        <svg viewBox="0 0 24 24" width={48} height={48} aria-hidden="true">
          <circle cx="12" cy="12" r="3" fill="currentColor" />
          <circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" strokeWidth={1.6} opacity={0.55} />
          <circle cx="12" cy="12" r="11" fill="none" stroke="currentColor" strokeWidth={1.4} opacity={0.3} />
        </svg>
      </div>
      <h2>Първият епизод започва тук</h2>
      <p>Качете корица и звуков файл, дайте заглавие и резюме. Звукът се оптимизира автоматично при качване.</p>
      <button type="button" onClick={onCreate} className="np-podcast-primary-btn">
        Създай първия епизод
      </button>
    </div>
  );
}

function NewEpisodeForm({
  categories,
  onCreated,
  onCancel,
}: {
  categories: Category[];
  onCreated: (episode: StudioEpisode) => void;
  onCancel?: () => void;
}) {
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioDuration, setAudioDuration] = useState<number | null>(null);
  const [audioBytes, setAudioBytes] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!coverFile) {
      setCoverPreview(null);
      return;
    }
    const url = URL.createObjectURL(coverFile);
    setCoverPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [coverFile]);

  useEffect(() => {
    if (!audioFile) {
      setAudioDuration(null);
      setAudioBytes(null);
      return;
    }
    setAudioBytes(audioFile.size);
    const url = URL.createObjectURL(audioFile);
    const audio = document.createElement("audio");
    audio.preload = "metadata";
    audio.src = url;
    const onLoaded = () => setAudioDuration(Math.round(audio.duration));
    audio.addEventListener("loadedmetadata", onLoaded);
    return () => {
      audio.removeEventListener("loadedmetadata", onLoaded);
      URL.revokeObjectURL(url);
    };
  }, [audioFile]);

  const valid = isNewEpisodeValid({ title, summary, categoryId, coverFile, audioFile }) && !submitting;

  async function submit(publish: boolean) {
    if (!coverFile || !audioFile) return;
    setSubmitting(true);
    setError(null);
    setNotice(null);
    try {
      const data = await uploadResumable("podcast", [{ key: "cover", file: coverFile }, { key: "audio", file: audioFile }], { title: title.trim(), summary: summary.trim(), categoryId: categoryId || null, publish }, setNotice);
      if (data.episode) {
        onCreated({
          ...data.episode,
          categoryName: categories.find((category) => category.id === data.episode.categoryId)?.name ?? null,
        });
        setNotice(publish ? "Епизодът е публикуван." : "Запазен като чернова.");
      } else {
        window.location.reload();
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Качването не мина.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      className="np-podcast-form"
      aria-busy={submitting}
      onSubmit={(event) => {
        event.preventDefault();
        const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
        void submit(submitter?.value === "1");
      }}
    >
      <header className="np-podcast-form-head">
        <div>
          <h2>Нов епизод</h2>
          <p>Заглавие, резюме, рубрика, корица и звук. Файлът се оптимизира автоматично при качване.</p>
        </div>
        <div className="np-podcast-form-actions">
          {onCancel ? (
            <button type="button" onClick={onCancel} disabled={submitting} className="np-podcast-ghost-btn">Откажи</button>
          ) : null}
          <button data-help="Качва епизода като чернова. Читателите още няма да го виждат." type="submit" value="0" disabled={!valid} className="np-podcast-secondary-btn">Запиши чернова</button>
          <button data-help="Качва и публикува епизода за слушане на сайта." type="submit" value="1" disabled={!valid} className="np-podcast-primary-btn">{submitting ? "Качва се…" : "Публикувай"}</button>
        </div>
      </header>

      {submitting ? <p role="status" className="np-podcast-alert">Качване и оптимизиране на звука. Изчакайте потвърждението, преди да затворите страницата.</p> : null}
      {error ? <p role="alert" className="np-podcast-alert np-podcast-alert--error">{error}</p> : null}
      {notice ? <p role="status" className="np-podcast-alert np-podcast-alert--ok">{notice}</p> : null}
      <p className="np-podcast-field-hint">Качване на части. При прекъсване изберете същите файлове и данни и продължете до 24 часа.</p>
      <button data-help="Отменя незавършеното качване. Избраният локален файл не се изтрива." type="button" onClick={() => void cancelResumableUpload("podcast").then(() => setNotice("Качването е отменено.")).catch(e => setError(e.message))}>Отмени незавършеното качване</button>

      <div className="np-podcast-form-grid">
        <DropZone
          label="Корица"
          hint="JPG, PNG или WebP · до 25 MB"
          preview={coverPreview}
          inputRef={coverInputRef}
          accept="image/jpeg,image/png,image/webp"
          onPick={setCoverFile}
          file={coverFile}
        />
        <AudioDropZone
          label="Звуков файл"
          hint="MP3, M4A, WAV или FLAC до 100 MB · автоматична оптимизация"
          inputRef={audioInputRef}
          accept={PODCAST_AUDIO_ACCEPT}
          onPick={setAudioFile}
          file={audioFile}
          durationSec={audioDuration}
          bytes={audioBytes}
        />
      </div>

      <div className="np-podcast-fields">
        <label className="np-podcast-field">
          <span className="np-podcast-field-label">Заглавие</span>
          <input data-help="Публичното заглавие на подкаст епизода."
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            required
            minLength={2}
            maxLength={180}
            placeholder="Например: Убийството на Илиян Филипов"
            className="np-podcast-input"
          />
          <span className="np-podcast-field-hint">{title.length}/180</span>
        </label>

        <label className="np-podcast-field">
          <span className="np-podcast-field-label">Резюме</span>
          <textarea data-help="Кратко описание на съдържанието на епизода за читателите."
            value={summary}
            onChange={(event) => setSummary(event.target.value)}
            required
            maxLength={600}
            rows={3}
            placeholder="Две-три изречения, които звучат на началната страница."
            className="np-podcast-textarea"
          />
          <span className="np-podcast-field-hint">{summary.length}/600</span>
        </label>

        <label className="np-podcast-field">
          <span className="np-podcast-field-label">Рубрика</span>
          <select data-help="Рубриката, с която да е свързан подкаст епизодът." value={categoryId} onChange={(event) => setCategoryId(event.target.value)} className="np-podcast-select">
            <option value="">Без рубрика</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>{category.name}</option>
            ))}
          </select>
        </label>
      </div>

      {!valid && !submitting ? (
        <p className="np-podcast-hint">Попълнете заглавие, резюме и качете двата файла, за да запишете.</p>
      ) : null}
    </form>
  );
}

function EpisodeEditor({
  episode,
  categories,
  webUrl,
  onPatch,
  onRemove,
}: {
  episode: StudioEpisode;
  categories: Category[];
  webUrl: string;
  onPatch: (patch: Partial<StudioEpisode>) => void;
  onRemove: () => void;
}) {
  const [title, setTitle] = useState(episode.title);
  const [summary, setSummary] = useState(episode.summary);
  const [categoryId, setCategoryId] = useState(episode.categoryId ?? "");
  const [dirty, setDirty] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(episode.publishedAt);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioDuration, setAudioDuration] = useState<number | null>(episode.durationSec);
  const [audioBytes, setAudioBytes] = useState<number | null>(episode.bytes);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTitle(episode.title);
    setSummary(episode.summary);
    setCategoryId(episode.categoryId ?? "");
    setDirty(false);
    setError(null);
    setNotice(null);
    setLastSavedAt(episode.publishedAt);
    setCoverFile(null);
    setAudioFile(null);
    setAudioDuration(episode.durationSec);
    setAudioBytes(episode.bytes);
  }, [episode.id]);

  useEffect(() => {
    if (!coverFile) {
      setCoverPreview(null);
      return;
    }
    const url = URL.createObjectURL(coverFile);
    setCoverPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [coverFile]);

  useEffect(() => {
    if (!audioFile) return;
    setAudioBytes(audioFile.size);
    const url = URL.createObjectURL(audioFile);
    const audio = document.createElement("audio");
    audio.preload = "metadata";
    audio.src = url;
    const onLoaded = () => setAudioDuration(Math.round(audio.duration));
    audio.addEventListener("loadedmetadata", onLoaded);
    return () => {
      audio.removeEventListener("loadedmetadata", onLoaded);
      URL.revokeObjectURL(url);
    };
  }, [audioFile]);

  const fieldsDirty = isEditorDirty({ title, summary, categoryId }, episode);
  const filesDirty = coverFile !== null || audioFile !== null;
  const canSave = (fieldsDirty || filesDirty) && !pending;
  const isPublished = episode.status === "published";

  async function send(body: unknown) {
    const response = await fetch(withBase("/api/podcasts/"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error?.message ?? "Записът не мина.");
    return data as { ok?: true; refreshed?: boolean; revision: number };
  }

  async function save() {
    setPending(true);
    setError(null);
    setNotice(null);
    try {
      if (filesDirty) {
        const files: Array<{ key: "cover" | "audio"; file: File }> = [];
        if (coverFile) files.push({ key: "cover", file: coverFile });
        if (audioFile) files.push({ key: "audio", file: audioFile });
        const data = await uploadResumable("podcast", files, { id: episode.id, revision: episode.revision, title: title.trim(), summary: summary.trim(), categoryId: categoryId || null, publish: isPublished }, setNotice);
        if (data.episode) {
          onPatch({ ...data.episode, categoryName: categories.find(category => category.id === data.episode.categoryId)?.name ?? null });
          setCoverFile(null);
          setAudioFile(null);
          setLastSavedAt(new Date().toISOString());
          setDirty(false);
          setNotice(data.audioOptimization?.savedBytes > 0 ? `Записано е. Звукът е намален от ${bytesText(data.audioOptimization.originalBytes)} на ${bytesText(data.audioOptimization.storedBytes)}.` : "Записано е.");
          return;
        }
      } else if (fieldsDirty) {
        const saved = await send({ action: "save", revision: episode.revision, id: episode.id, title: title.trim(), summary: summary.trim(), categoryId: categoryId || null });
        onPatch({ revision: saved.revision, title: title.trim(), summary: summary.trim(), categoryId: categoryId || null, categoryName: categories.find((category) => category.id === (categoryId || null))?.name ?? null });
        setLastSavedAt(new Date().toISOString());
        setDirty(false);
        setNotice("Записано е.");
        return;
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Записът не мина.");
    } finally {
      setPending(false);
    }
  }

  async function setStatus(status: "published" | "draft") {
    setPending(true);
    setError(null);
    try {
      const changed = await send({ action: status === "published" ? "publish" : "hide", id: episode.id, revision: episode.revision });
      onPatch({
        status, revision: changed.revision,
        publishedAt: status === "published" ? episode.publishedAt ?? new Date().toISOString() : episode.publishedAt,
      });
      setNotice(status === "published" ? "Епизодът е на сайта." : "Епизодът е скрит.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Записът не мина.");
    } finally {
      setPending(false);
    }
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const isMeta = event.metaKey || event.ctrlKey;
      if (isMeta && event.key.toLowerCase() === "s") {
        event.preventDefault();
        if (canSave) void save();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canSave, title, summary, categoryId, coverFile, audioFile]);

  return (
    <article className="np-podcast-editor">
      <header className="np-podcast-editor-head">
        <div className="np-podcast-editor-head-left">
          <span className={`np-podcast-status np-podcast-status--${episode.status}`}>
            <span className="np-podcast-status-dot" />
            {isPublished ? "На сайта" : "Чернова"}
          </span>
          <h2 className="np-podcast-editor-title" title={episode.title}>{episode.title}</h2>
          <a
            className="np-podcast-editor-link"
            href={`${webUrl}/livepoint/podcast/${episode.slug}/`}
            target="_blank"
            rel="noreferrer"
          >
            Отвори на сайта
            <svg viewBox="0 0 24 24" width={12} height={12} aria-hidden="true"><path d="M10 14a4 4 0 0 0 5.66 0l3-6.66M14 10a4 4 0 0 0-5.66 0L5 16.66M14 10l-4 4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" /></svg>
          </a>
        </div>
        <div className="np-podcast-editor-head-right">
          {lastSavedAt ? (
            <span className="np-podcast-save-state" title={`Записано ${longDate(lastSavedAt)}`}>
              <span className="np-podcast-save-dot" />
              Записано {shortDate(lastSavedAt)}
            </span>
          ) : null}
          {dirty ? <span className="np-podcast-save-state np-podcast-save-state--dirty">Незаписани промени</span> : null}
        </div>
      </header>

      <div className="np-podcast-editor-body">
        <div className="np-podcast-editor-preview">
          <DropZone
            label="Корица"
            hint="Кликнете или качете нова"
            preview={coverPreview ?? `${webUrl}/media/${episode.coverKey}`}
            inputRef={coverInputRef}
            accept="image/jpeg,image/png,image/webp"
            onPick={setCoverFile}
            file={coverFile}
            existingLabel={coverFile ? "Нова корица" : "Текуща корица"}
          />
          <AudioDropZone
            label="Звуков файл"
            hint="Новият файл се оптимизира при запис"
            inputRef={audioInputRef}
            accept={PODCAST_AUDIO_ACCEPT}
            onPick={setAudioFile}
            file={audioFile}
            durationSec={audioDuration}
            bytes={audioBytes}
            existingLabel={audioFile ? "Нов файл" : "Текущ файл"}
          />
        </div>

        <div className="np-podcast-editor-fields">
          <label className="np-podcast-field">
            <span className="np-podcast-field-label">Заглавие</span>
            <input data-help="Публичното заглавие на подкаст епизода."
              value={title}
              onChange={(event) => {
                setTitle(event.target.value);
                setDirty(true);
              }}
              maxLength={180}
              className="np-podcast-input"
            />
            <span className="np-podcast-field-hint">{title.length}/180</span>
          </label>

          <label className="np-podcast-field">
            <span className="np-podcast-field-label">Резюме</span>
            <textarea data-help="Кратко описание на съдържанието на епизода за читателите."
              value={summary}
              onChange={(event) => {
                setSummary(event.target.value);
                setDirty(true);
              }}
              maxLength={600}
              rows={4}
              className="np-podcast-textarea"
            />
            <span className="np-podcast-field-hint">{summary.length}/600</span>
          </label>

          <label className="np-podcast-field">
            <span className="np-podcast-field-label">Рубрика</span>
            <select data-help="Рубриката, с която да е свързан подкаст епизодът."
              value={categoryId}
              onChange={(event) => {
                setCategoryId(event.target.value);
                setDirty(true);
              }}
              className="np-podcast-select"
            >
              <option value="">Без рубрика</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>{category.name}</option>
              ))}
            </select>
          </label>

          <dl className="np-podcast-meta">
            <div><dt>Slug</dt><dd><code>{episode.slug}</code></dd></div>
            <div><dt>Продължителност</dt><dd>{clock(audioDuration ?? episode.durationSec)}</dd></div>
            <div><dt>Размер</dt><dd>{bytesText(audioBytes ?? episode.bytes)}</dd></div>
            <div><dt>Създаден</dt><dd>{longDate(episode.publishedAt)}</dd></div>
          </dl>
        </div>
      </div>

      <div className="np-podcast-editor-foot">
        {error ? <span role="alert" className="np-podcast-alert np-podcast-alert--error">{error}</span> : null}
        {notice ? <span role="status" className="np-podcast-alert np-podcast-alert--ok">{notice}</span> : null}
        <PodcastSocialShare key={`${episode.id}:${episode.revision}`} episodeId={episode.id} revision={episode.revision}
          blockedReason={pending ? "Изчакай записването на епизода."
            : fieldsDirty || filesDirty ? "Запиши промените, преди да споделиш епизода."
            : !isPublished ? "Първо публикувай епизода в сайта." : undefined} />
        <button data-help="Отменя незавършеното качване. Избраният локален файл не се изтрива." type="button" onClick={() => void cancelResumableUpload("podcast", episode.id).then(() => setNotice("Качването е отменено.")).catch(e => setError(e.message))}>Отмени незавършеното качване</button>
        <div className="np-podcast-editor-foot-actions">
          {isPublished ? (
            <button data-help="Скрива епизода от сайта и го запазва като чернова." type="button" disabled={pending} onClick={() => void setStatus("draft")} className="np-podcast-ghost-btn">Скрий от сайта</button>
          ) : (
            <button data-help="Прави готовия епизод видим за слушателите на сайта." type="button" disabled={pending} onClick={() => void setStatus("published")} className="np-podcast-secondary-btn">Публикувай</button>
          )}
          <button data-help="Записва редакциите на епизода. Ако е публикуван, промените се виждат и на сайта." type="button" disabled={!canSave} onClick={() => void save()} className="np-podcast-primary-btn">
            Запиши
          </button>
        </div>
      </div>

      <button type="button" className="np-podcast-remove" onClick={onRemove} aria-label="Затвори редактора">×</button>
    </article>
  );
}

function DropZone({
  label,
  hint,
  preview,
  inputRef,
  accept,
  onPick,
  file,
  existingLabel,
}: {
  label: string;
  hint: string;
  preview: string | null;
  inputRef: React.RefObject<HTMLInputElement | null>;
  accept: string;
  onPick: (file: File | null) => void;
  file: File | null;
  existingLabel?: string;
}) {
  const [dragging, setDragging] = useState(false);
  return (
    <div
      className={`np-podcast-drop ${dragging ? "is-dragging" : ""}`}
      onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        const next = event.dataTransfer.files[0];
        if (next) onPick(next);
      }}
    >
      <div className="np-podcast-drop-label">
        <span>{label}</span>
        {file || existingLabel ? <span className="np-podcast-drop-tag">{file ? "Нов файл" : existingLabel}</span> : null}
      </div>
      <button data-help="Избира обложка за епизода. Можете и да пуснете снимка с влачене." type="button" onClick={() => inputRef.current?.click()} className="np-podcast-drop-target">
        {preview ? (
          <img src={preview} alt="" className="np-podcast-drop-preview" />
        ) : (
          <span className="np-podcast-drop-placeholder">
            <svg viewBox="0 0 24 24" width={28} height={28} aria-hidden="true"><path d="M12 16V4M7 9l5-5 5 5M5 20h14" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" /></svg>
            <span>Кликнете или пуснете файл</span>
          </span>
        )}
      </button>
      <p className="np-podcast-drop-hint">{hint}</p>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={(event) => onPick(event.target.files?.[0] ?? null)}
        className="np-podcast-hidden-input"
      />
    </div>
  );
}

function AudioDropZone({
  label,
  hint,
  inputRef,
  accept,
  onPick,
  file,
  durationSec,
  bytes,
  existingLabel,
}: {
  label: string;
  hint: string;
  inputRef: React.RefObject<HTMLInputElement | null>;
  accept: string;
  onPick: (file: File | null) => void;
  file: File | null;
  durationSec: number | null;
  bytes: number | null;
  existingLabel?: string;
}) {
  const [dragging, setDragging] = useState(false);
  return (
    <div
      className={`np-podcast-drop np-podcast-drop--audio ${dragging ? "is-dragging" : ""}`}
      onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        const next = event.dataTransfer.files[0];
        if (next) onPick(next);
      }}
    >
      <div className="np-podcast-drop-label">
        <span>{label}</span>
        {file || existingLabel ? <span className="np-podcast-drop-tag">{file ? "Нов файл" : existingLabel}</span> : null}
      </div>
      <button data-help="Избира аудио файл за епизода. Можете и да го пуснете с влачене в полето." type="button" onClick={() => inputRef.current?.click()} className="np-podcast-drop-target np-podcast-drop-target--audio">
        <span className="np-podcast-audio-icon">
          <svg viewBox="0 0 24 24" width={28} height={28} aria-hidden="true">
            <path d="M4 10v4M8 7v10M12 4v16M16 8v8M20 11v2" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
          </svg>
        </span>
        <span className="np-podcast-audio-name">{file ? file.name : "Кликнете или пуснете звуков файл"}</span>
        <span className="np-podcast-audio-meta">
          {durationSec != null ? <span>{clock(durationSec)}</span> : null}
          {bytes != null ? <span>{bytesText(bytes)}</span> : null}
          {!file && !durationSec && !bytes ? <span>Изчаква файл…</span> : null}
        </span>
      </button>
      <p className="np-podcast-drop-hint">{hint}</p>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={(event) => onPick(event.target.files?.[0] ?? null)}
        className="np-podcast-hidden-input"
      />
    </div>
  );
}
