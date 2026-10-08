"use client";

import Link from "next/link";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import type { Conflict, Draft, MediaOption, PublishOutcome } from "@/lib/articles";
import { callApi } from "@/lib/client-api";
import { textToBody } from "@/lib/editor/body";
import { documentWords } from "@/lib/editor/document";
import { embedFrameUrl } from "@newspoint/content";
import { VisualArticleEditor, type VisualEditorHandle } from "./visual-article-editor";
import { parseEmbedInput } from "@/lib/editor/embed";
import { AUTHOR_NAME_MAX, EXCERPT_MAX, publishProblems, TITLE_MAX } from "@/lib/editor/input";
import { slugify } from "@/lib/editor/slug";
import { formatWhen } from "@/lib/format";
import { browserMediaSrc } from "@/lib/media-src";
import { withBase } from "@/lib/paths";
import { ArticlePreview, type PreviewTheme } from "./article-preview";
import { EditorDialog } from "./editor-dialog";
import { MediaPicker } from "./media-picker";

export interface EditorProps {
  staff: { id: string; name: string };
  article: {
    id: string | null;
    sourceSystem: "wordpress" | "studio";
    isPublic: boolean;
    path: string;
    authorName: string;
    publishedAt: string | null;
    publishedRevision: number | null;
    revision: number;
    revisionSavedAt: string | null;
    revisionSavedBy: string | null;
    editableBody: boolean;
    canEdit: boolean;
    viewSeedLocked: boolean;
    viewReal: number;
    viewAdded: number;
    listenEnabled: boolean;
  };
  draft: Draft;
  sections: { id: string; name: string }[];
  media: MediaOption[];
  storyThemes?: { id: string; title: string; isPublished: boolean }[];
  storyThemeId?: string | null;
  webUrl: string;
}

type Notice = { tone: "error" | "success"; text: string; href?: string };
type HistoryEntry = { number: number; savedAt: string; savedBy: string | null; draft: Draft; editableBody: boolean; listenEnabled: boolean };
type Device = "desktop" | "phone";

const sameDraft = (a: Draft, b: Draft) => JSON.stringify(a) === JSON.stringify(b);

function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (value: T) => void; label: string }) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-xl border border-line bg-surface p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className="rounded-[0.6rem] px-3 py-1.5 text-xs font-bold text-muted transition hover:text-ink aria-pressed:bg-shell aria-pressed:text-white"
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function ArticleEditor({ article, draft: initialDraft, staff, sections, media, storyThemes = [], storyThemeId: initialStoryThemeId = null, webUrl }: EditorProps) {
  const [articleId, setArticleId] = useState(article.id);
  const idRef = useRef(article.id);
  const initial = { ...initialDraft, listenEnabled: initialDraft.listenEnabled ?? article.listenEnabled };
  const [draft, setDraft] = useState<Draft>(initial);
  const [saved, setSaved] = useState<Draft>(initial);
  const [revision, setRevision] = useState(article.revision);
  const [savedAt, setSavedAt] = useState(article.revisionSavedAt);
  const [slugTouched, setSlugTouched] = useState(Boolean(initialDraft.slug));
  const [phase, setPhase] = useState<"idle" | "saving" | "publishing">("idle");
  const [conflict, setConflict] = useState<Conflict | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [leaveDestination, setLeaveDestination] = useState<string | null>(null);
  const allowLeave = useRef(false);
  const [problems, setProblems] = useState<string[]>([]);
  const [published, setPublished] = useState({ isPublic: article.isPublic, revision: article.publishedRevision, path: article.path, at: article.publishedAt });

  const [seedLocked, setSeedLocked] = useState(article.viewSeedLocked);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [mediaTarget, setMediaTarget] = useState<"body" | "hero">("hero");
  const [device, setDevice] = useState<Device>("desktop");
  const [theme, setTheme] = useState<PreviewTheme>("light");
  const [mobileTab, setMobileTab] = useState<"edit" | "preview">("edit");
  const [previewCollapsed, setPreviewCollapsed] = useState(false);
  const [availableMedia, setAvailableMedia] = useState(media);
  const [storyThemeId, setStoryThemeId] = useState<string | null>(initialStoryThemeId);
  const [savedStoryThemeId, setSavedStoryThemeId] = useState<string | null>(initialStoryThemeId);
  const publishKey = useRef<{ key: string; payload: string } | null>(null);
  const creationId = useRef<string | null>(null);
  const savingRef = useRef(false);
  const publishingRef = useRef(false);
  const visualRef = useRef<VisualEditorHandle | null>(null);
  const [history, setHistory] = useState<HistoryEntry[] | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [editorValid, setEditorValid] = useState(true);
  const [heroDialog, setHeroDialog] = useState(false);
  const [heroInput, setHeroInput] = useState("");
  const [heroError, setHeroError] = useState("");

  useEffect(() => {
    try {
      if (localStorage.getItem("np-studio-preview-collapsed") === "1") setPreviewCollapsed(true);
    } catch {
      /* ignore */
    }
  }, []);

  function togglePreview() {
    setPreviewCollapsed((current) => {
      const next = !current;
      try {
        localStorage.setItem("np-studio-preview-collapsed", next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  const readOnly = !article.canEdit;
  const bodyLocked = readOnly || !article.editableBody;
  const storyThemeDirty = storyThemeId !== savedStoryThemeId;
  const dirty = !sameDraft(draft, saved) || storyThemeDirty;
  const busy = phase !== "idle";
  const hero = availableMedia.find((item) => item.id === draft.heroMediaId) ?? null;
  const body = useMemo(() => draft.body ?? textToBody(draft.bodyText), [draft.body, draft.bodyText]);
  const words = documentWords(body);

  const previewSource = useDeferredValue(draft);
  const previewBlocks = useMemo(() => previewSource.body ?? textToBody(previewSource.bodyText), [previewSource.body, previewSource.bodyText]);
  const previewCategory = sections.find((section) => section.id === previewSource.primaryCategoryId)?.name ?? null;

  const update = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((current) => {
      const next = { ...current, [key]: value };
      if (key === "title" && !slugTouched && !published.at) next.slug = slugify(String(value));
      return next;
    });
    setProblems([]);
    if (notice?.tone === "success") setNotice(null);
  };

  const openMediaPicker = (target: "body" | "hero") => {
    setMediaTarget(target);
    setPickerOpen(true);
  };

  const rememberMedia = (items: MediaOption[]) => {
    if (!items.length) return;
    setAvailableMedia((current) => {
      const map = new Map(current.map((item) => [item.id, item]));
      for (const item of items) map.set(item.id, item);
      return [...map.values()];
    });
  };

  const setHeroEmbed = () => {
    setHeroInput(draft.heroEmbedUrl ?? "");
    setHeroError("");
    setHeroDialog(true);
  };

  const applyHeroEmbed = () => {
    const parsed = parseEmbedInput(heroInput);
    if (!parsed || !embedFrameUrl(parsed.url)) {
      setHeroError("Водещият embed трябва да е поддържана YouTube или Facebook публикация.");
      return;
    }
    setDraft(current => ({ ...current, heroEmbedUrl: parsed.url, heroMediaId: null }));
    setHeroDialog(false);
  };

  const selectAuthor = (authorKind: Draft["authorKind"]) => {
    setDraft((current) => {
      if (authorKind === "staff") return { ...current, authorKind, authorUserId: staff.id, authorName: staff.name };
      if (authorKind === "newsroom") return { ...current, authorKind, authorUserId: null, authorName: "NewsPoint.bg" };
      return { ...current, authorKind, authorUserId: null, authorName: current.authorKind === "manual" ? current.authorName : "" };
    });
    setProblems([]);
    if (notice?.tone === "success") setNotice(null);
  };

  const save = useCallback(
    async (expected = revision): Promise<number | null> => {
      if (savingRef.current || !editorValid) return null;
      savingRef.current = true;
      const snapshot = draft;
      const { bodyText: legacyText, ...structured } = snapshot;
      const payload = snapshot.body !== undefined ? structured : snapshot;
      const themeId = storyThemeId;
      const themeChanged = themeId !== savedStoryThemeId;
      setPhase("saving");
      setNotice(null);

      const assignTheme = async (id: string) => {
        if (!themeChanged) return true;
        const assigned = await callApi("POST", "/api/stories/", { action: "assignArticle", articleId: id, themeId });
        if (!assigned.ok) {
          setNotice({ tone: "error", text: `Материалът е записан, но темата не е свързана: ${assigned.error.message} Повторете записа.` });
          return false;
        }
        setSavedStoryThemeId(themeId);
        return true;
      };

      try {
        if (!idRef.current) {
          creationId.current ??= crypto.randomUUID();
          const result = await callApi<{ id: string; revision: number }>("POST", "/api/editor/articles/", { ...payload, creationId: creationId.current });
          if (!result.ok) {
            setNotice({ tone: "error", text: result.error.message });
            return null;
          }
          idRef.current = result.data.id;
          setArticleId(result.data.id);
          window.history.replaceState(null, "", withBase(`/articles/${result.data.id}/`));
          setSaved(snapshot);
          setRevision(result.data.revision);
          setSavedAt(new Date().toISOString());
          if (!(await assignTheme(result.data.id))) return null;
          return result.data.revision;
        }

        if (!sameDraft(snapshot, saved)) {
          const result = await callApi<{ revision: number }>("POST", `/api/editor/articles/${idRef.current}/revisions/`, { expectedRevision: expected, draft: payload });
          if (!result.ok) {
            if (result.status === 409 && result.error.code === "conflict") setConflict(result.error.details as Conflict);
            else {
              const detail = Array.isArray(result.error.details) ? result.error.details.find((item): item is string => typeof item === "string" && item.trim().length > 0) : null;
              setNotice({ tone: "error", text: detail ? `${result.error.message} ${detail}` : result.error.message });
            }
            return null;
          }
          setConflict(null);
          setSaved(snapshot);
          setRevision(result.data.revision);
          setSavedAt(new Date().toISOString());
          if (!(await assignTheme(idRef.current))) return null;
          return result.data.revision;
        }

        if (!(await assignTheme(idRef.current))) return null;
        return revision;
      } finally {
        savingRef.current = false;
        setPhase("idle");
      }
    },
    [draft, revision, saved, storyThemeId, savedStoryThemeId, editorValid],
  );

  async function publish() {
    if (publishingRef.current || savingRef.current || !editorValid) return;
    publishingRef.current = true;
    try {
    const blocking = publishProblems({ ...draft, bodyBlocks: body.length });
    if (blocking.length) {
      setProblems(blocking);
      return;
    }
    let toPublish = revision;
    if (dirty || !idRef.current) {
      const next = await save();
      if (next === null) return;
      toPublish = next;
    }
    // Kept until the server answers, so a retry after a lost response publishes once.
    const publishPayload = JSON.stringify({ revision: toPublish, listenEnabled: draft.listenEnabled });
    if (publishKey.current?.payload !== publishPayload) publishKey.current = { key: crypto.randomUUID(), payload: publishPayload };
    setPhase("publishing");
    const result = await callApi<PublishOutcome>("POST", `/api/editor/articles/${idRef.current}/publish/`, { revision: toPublish, idempotencyKey: publishKey.current.key, listenEnabled: draft.listenEnabled ?? article.listenEnabled });
    setPhase("idle");
    if (!result.ok) {
      if (result.status > 0 && result.status < 500) publishKey.current = null;
      if (result.status === 422 && Array.isArray(result.error.details)) setProblems(result.error.details as string[]);
      else setNotice({ tone: "error", text: result.error.message });
      return;
    }
    publishKey.current = null;
    if (draft.viewSeed != null) setSeedLocked(true);
    setPublished((current) => ({ isPublic: true, revision: result.data.revision, path: result.data.path, at: current.at ?? new Date().toISOString() }));
    setNotice({
      tone: "success",
      text: result.data.type === "article.published" ? "Статията е публикувана. Читателите я виждат веднага." : "Публикацията е обновена.",
      href: `${webUrl}${result.data.path}`,
    });
    } finally { publishingRef.current = false; }
  }

  async function openHistory() {
    if (!idRef.current || historyLoading) return;
    setHistoryLoading(true);
    const result = await callApi<{ revisions: HistoryEntry[]; media: MediaOption[] }>("GET", `/api/editor/articles/${idRef.current}/revisions/`);
    setHistoryLoading(false);
    if (!result.ok) { setNotice({ tone: "error", text: result.error.message }); return; }
    rememberMedia(result.data.media); setHistory(result.data.revisions);
  }

  async function openPreviewTab() {
    const tab = window.open("about:blank", "_blank");
    if ((dirty || !idRef.current) && (await save()) === null) {
      tab?.close();
      return;
    }
    if (tab) tab.location.href = withBase(`/articles/${idRef.current}/preview/`);
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        if (!readOnly && !busy && !publishingRef.current && !conflict && editorValid && dirty) void save();
      }
    };
    const onLeave = (event: BeforeUnloadEvent) => {
      if (dirty && !allowLeave.current) { event.preventDefault(); event.returnValue = ""; }
    };
    const onNavigate = (event: MouseEvent) => {
      if (!dirty || event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest<HTMLAnchorElement>("a[href]");
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const destination = new URL(anchor.href, window.location.href);
      if (destination.origin !== window.location.origin || destination.pathname === window.location.pathname) return;
      event.preventDefault(); event.stopPropagation();
      setLeaveDestination(destination.href);
    };
    document.addEventListener("click", onNavigate, true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("beforeunload", onLeave);
    return () => {
      document.removeEventListener("click", onNavigate, true);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("beforeunload", onLeave);
    };
  }, [busy, dirty, readOnly, save, conflict, editorValid]);

  const saveStatus =
    phase === "saving"
      ? "Записване…"
      : conflict
        ? "Конфликт с друга версия"
        : dirty
          ? "Незаписани промени"
          : revision > 0 && savedAt
            ? `Записано ${formatWhen(savedAt)} · версия ${revision}`
            : "Нова чернова";
  const hasUnpublished = published.isPublic && !dirty && published.revision !== revision;
  const previewUrl = `${webUrl.replace(/\/$/, "")}/${draft.slug || "adres-na-statiyata"}/`;

  return (
    <div className="flex min-h-[calc(100dvh-3.5rem)] flex-col lg:min-h-dvh">
      <div className="sticky top-14 z-20 border-b border-line bg-surface/95 backdrop-blur lg:top-0">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 px-4 py-2 sm:px-5">
          <Link href="/" className="text-sm font-bold text-muted hover:text-ink">
            ← Материали
          </Link>
          <span className="hidden text-faint sm:inline" aria-hidden="true">
            /
          </span>
          <span className="hidden text-sm font-bold text-ink sm:inline">{articleId ? "Редакция" : "Нов материал"}</span>
          <span
            role="status"
            className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-bold ${
              conflict ? "bg-danger/10 text-danger" : dirty ? "bg-warning/10 text-warning" : "bg-surface-2 text-muted"
            }`}
          >
            <span className={`size-1.5 rounded-full ${conflict ? "bg-danger" : dirty ? "bg-warning" : "bg-success"}`} aria-hidden="true" />
            {saveStatus}
          </span>
          {published.isPublic ? (
            <a
              href={`${webUrl}${published.path}`}
              target="_blank"
              rel="noreferrer"
              className="hidden items-center gap-1.5 rounded-full bg-success/10 px-3 py-1 text-xs font-bold text-success hover:underline md:inline-flex"
            >
              <span className="size-1.5 rounded-full bg-success" aria-hidden="true" />
              На сайта{published.revision ? ` · версия ${published.revision}` : ""} ↗
            </a>
          ) : null}
          {hasUnpublished ? <span className="hidden text-xs font-bold text-warning xl:inline">Има промени, които не са на сайта</span> : null}

          {articleId ? <button type="button" disabled={busy || historyLoading} className="np-btn np-btn-secondary px-3 py-1.5 text-xs" onClick={() => void openHistory()}>{historyLoading ? "Зареждане…" : "Версии"}</button> : null}
          {!readOnly ? (
            <div className="ml-auto flex items-center gap-1.5">
              <label className="inline-flex items-center gap-2 pr-1 text-xs font-bold text-ink">
                <input type="checkbox" checked={draft.listenEnabled ?? article.listenEnabled} onChange={(event) => update("listenEnabled", event.target.checked)} />
                Позволи слушане
              </label>
              <button type="button" disabled={busy || !editorValid || Boolean(conflict) || (!dirty && Boolean(articleId))} onClick={() => void save()} className="np-btn np-btn-secondary px-3 py-1.5 text-xs">
                {phase === "saving" ? "Записване…" : "Запиши"}
              </button>
              <button type="button" disabled={busy || !editorValid || Boolean(conflict)} onClick={() => void publish()} className="np-btn np-btn-primary px-4 py-1.5 text-xs">
                {phase === "publishing" ? "Публикуване…" : published.isPublic ? "Обнови публикацията" : "Публикувай"}
              </button>
            </div>
          ) : null}
        </div>

        <div className="flex border-t border-line lg:hidden" role="tablist" aria-label="Изглед">
          {(
            [
              ["edit", "Редакция"],
              ["preview", "Преглед"],
            ] as const
          ).map(([tab, label]) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={mobileTab === tab}
              onClick={() => setMobileTab(tab)}
              className="relative flex-1 py-2.5 text-sm font-bold text-muted aria-selected:text-ink"
            >
              {label}
              {mobileTab === tab ? <span className="np-gradient-bg absolute inset-x-6 bottom-0 h-0.5 rounded-full" aria-hidden="true" /> : null}
            </button>
          ))}
        </div>
      </div>

      <div className={`studio-editor-split grid flex-1 ${previewCollapsed ? "is-preview-collapsed" : ""}`}>
        <div className={`studio-editor-pane min-w-0 space-y-2 px-2.5 py-2 sm:px-4 lg:block lg:py-3 xl:px-5 ${mobileTab === "edit" ? "" : "hidden"}`}>
          {bodyLocked && !readOnly ? (
            <p className="rounded-xl border border-line bg-surface-2 px-3 py-2 text-xs text-muted">
              Част от текста е в стар формат и остава непроменена. Заглавие, рубрика, автор, снимка и прегледи се записват.
            </p>
          ) : null}

          {conflict ? (
            <div role="alert" className="rounded-2xl border border-danger/30 bg-danger/5 p-5">
              <p className="font-extrabold text-ink">
                {conflict.savedBy ?? "Друг редактор"} записа версия {conflict.revision} в {formatWhen(conflict.savedAt)}.
              </p>
              <p className="mt-1 text-sm text-body">Вашият текст не е загубен. Той е тук, в полетата отдолу. Изберете как да продължите:</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" disabled={busy} onClick={() => void save(conflict.revision)} className="np-btn np-btn-primary">
                  Запиши моята версия
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    rememberMedia(conflict.media ?? []);
                    setDraft(conflict.draft);
                    setSaved(conflict.draft);
                    setRevision(conflict.revision);
                    setSavedAt(new Date(conflict.savedAt).toISOString());
                    setConflict(null);
                  }}
                  className="np-btn np-btn-secondary"
                >
                  Зареди неговата версия
                </button>
              </div>
            </div>
          ) : null}

          {problems.length ? (
            <div role="alert" className="rounded-2xl border border-danger/20 bg-danger/5 px-5 py-4">
              <p className="text-sm font-extrabold text-danger">Преди публикуване:</p>
              <ul className="mt-1.5 space-y-1 text-sm font-semibold text-danger">
                {problems.map((problem) => (
                  <li key={problem}>• {problem}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {notice ? (
            <div
              role={notice.tone === "error" ? "alert" : "status"}
              className={`flex flex-wrap items-center gap-x-4 gap-y-1 rounded-2xl px-5 py-3.5 text-sm font-semibold ${notice.tone === "error" ? "border border-danger/20 bg-danger/5 text-danger" : "border border-success/20 bg-success/10 text-success"}`}
            >
              {notice.text}
              {notice.href ? (
                <a href={notice.href} target="_blank" rel="noreferrer" className="font-extrabold underline underline-offset-2">
                  Виж на сайта →
                </a>
              ) : null}
            </div>
          ) : null}

          <div className="studio-meta np-card overflow-hidden">
            <div className="studio-meta-fields">
              <label htmlFor="category" className="studio-meta-field">
                <span>Рубрика</span>
                <select
                  id="category"
                  value={draft.primaryCategoryId ?? ""}
                  disabled={readOnly}
                  onChange={(event) => update("primaryCategoryId", event.target.value || null)}
                  className="np-input"
                >
                  <option value="">— Изберете рубрика —</option>
                  {sections.map((section) => (
                    <option key={section.id} value={section.id}>
                      {section.name}
                    </option>
                  ))}
                </select>
              </label>
              <label htmlFor="story-theme" className="studio-meta-field">
                <span>Тема с продължение</span>
                <select
                  id="story-theme"
                  aria-label="Тема с продължение"
                  value={storyThemeId ?? ""}
                  disabled={readOnly || !storyThemes.length}
                  onChange={(event) => {
                    setStoryThemeId(event.target.value || null);
                    setProblems([]);
                    if (notice?.tone === "success") setNotice(null);
                  }}
                  className="np-input"
                >
                  <option value="">{storyThemes.length ? "— Без тема —" : "— Няма създадени теми —"}</option>
                  {storyThemes.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.title}{item.isPublished ? "" : " (чернова)"}
                    </option>
                  ))}
                </select>
              </label>

              <div className="studio-meta-field">
                <span>Снимка</span>
                <div className="studio-meta-hero">
                  {hero ? (
                    <img src={browserMediaSrc(hero.url)} alt={hero.alt} className="studio-meta-thumb" />
                  ) : null}
                  {!readOnly ? (
                    <>
                      <button type="button" onClick={() => openMediaPicker("hero")} className="np-btn np-btn-secondary">
                        {hero ? "Смени" : "Избери"}
                      </button>
                      <button type="button" onClick={setHeroEmbed} className="np-btn np-btn-secondary">Embed</button>
                      {draft.heroEmbedUrl ? <button type="button" onClick={() => update("heroEmbedUrl", null)} className="np-btn np-btn-secondary">Махни embed</button> : null}
                      {hero ? (
                        <button type="button" onClick={() => update("heroMediaId", null)} className="np-btn np-btn-secondary">
                          Махни
                        </button>
                      ) : null}
                    </>
                  ) : (
                    <span className="truncate text-[11px] text-muted">{hero?.alt || "—"}</span>
                  )}
                </div>
              </div>

              <div className="studio-meta-field">
                <span>Прегледи</span>
                <div className="studio-meta-views">
                  <input
                    aria-label="Прегледи при публикуване"
                    inputMode="numeric"
                    disabled={readOnly || seedLocked}
                    value={draft.viewSeed ?? ""}
                    onChange={(event) => update("viewSeed", event.target.value === "" ? null : Math.max(0, Math.trunc(Number(event.target.value) || 0)))}
                    placeholder="старт"
                    className="np-input np-views-input tabular-nums"
                  />
                  <input
                    aria-label="Интервал"
                    inputMode="numeric"
                    disabled={readOnly}
                    value={draft.viewEvery ?? ""}
                    onChange={(event) => update("viewEvery", event.target.value === "" ? null : Math.max(1, Math.trunc(Number(event.target.value) || 1)))}
                    placeholder="всеки"
                    className="np-input np-views-input tabular-nums"
                  />
                  <select
                    aria-label="Мярка за времето"
                    disabled={readOnly}
                    value={draft.viewUnit}
                    onChange={(event) => update("viewUnit", event.target.value as Draft["viewUnit"])}
                    className="np-input np-views-input"
                  >
                    <option value="seconds">сек</option>
                    <option value="minutes">мин</option>
                    <option value="hours">ч</option>
                  </select>
                  <input
                    aria-label="Краен брой прегледи"
                    inputMode="numeric"
                    disabled={readOnly}
                    value={draft.viewTarget ?? ""}
                    onChange={(event) => update("viewTarget", event.target.value === "" ? null : Math.max(0, Math.trunc(Number(event.target.value) || 0)))}
                    placeholder="до"
                    className="np-input np-views-input tabular-nums"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="np-card p-3">
            <label htmlFor="title" className="np-label">
              Заглавие
            </label>
            <textarea
              id="title"
              aria-describedby="title-seo-hint"
              rows={1}
              maxLength={TITLE_MAX}
              value={draft.title}
              disabled={readOnly}
              onChange={(event) => update("title", event.target.value.replace(/\n/g, " "))}
              placeholder="Заглавие на материала"
              className="w-full resize-none bg-transparent text-[0.95rem] leading-snug font-bold tracking-tight text-ink outline-none [field-sizing:content] placeholder:text-faint"
            />
            <p id="title-seo-hint" className="mt-1 text-[11px] text-muted">{draft.title.trim().length}/{TITLE_MAX} знака. Заглавието се използва и при търсене и споделяне; Google може да го съкрати или преформулира.</p>
            <div className="mt-1 flex flex-wrap items-center gap-1 text-[11px] text-muted">
              <span className="font-semibold">Адрес:</span>
              <span className="text-faint">{new URL(webUrl).host}/</span>
              <input
                aria-label="Адрес на статията"
                value={draft.slug}
                disabled={readOnly || Boolean(published.at)}
                onChange={(event) => {
                  setSlugTouched(true);
                  update("slug", event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"));
                }}
                placeholder="adres-na-statiyata"
                className="min-w-40 flex-1 rounded-md bg-transparent px-1 py-0 font-semibold text-ink outline-none focus:bg-surface-2 disabled:text-muted"
              />
              {published.isPublic ? <span className="text-[11px] text-faint">(не се сменя след публикуване)</span> : null}
            </div>

            <label htmlFor="excerpt" className="np-label mt-3">
              Кратко резюме
            </label>
            <textarea
              id="excerpt"
              aria-describedby="excerpt-seo-hint"
              rows={2}
              maxLength={EXCERPT_MAX}
              value={draft.excerpt}
              disabled={readOnly}
              onChange={(event) => update("excerpt", event.target.value)}
              placeholder="Едно-две изречения, които се показват под заглавието и в картите."
              className="np-input resize-none [field-sizing:content]"
            />
            <p id="excerpt-seo-hint" className="mt-1 text-[11px] text-muted">{draft.excerpt.trim().length}/{EXCERPT_MAX} знака. Резюмето е описанието при споделяне и предложението към търсачките; описвайте конкретната новина.</p>

            <div className="mt-4 flex items-end justify-between gap-3 border-t border-line pt-4">
              <label htmlFor="body" className="np-label mb-0">
                Текст
              </label>
              <span className="text-xs text-faint tabular-nums">{words} думи</span>
            </div>
            {!article.editableBody ? <p className="mt-2 text-sm text-warning">Текстът съдържа елементи, които този редактор още не поддържа.</p> : null}
            <VisualArticleEditor value={body} onChange={(value) => update("body", value)} media={availableMedia} readOnly={bodyLocked} onValidityChange={setEditorValid} onOpenMedia={() => openMediaPicker("body")} handleRef={visualRef} />
            <p className="mt-2 text-xs text-muted">{words} думи · Ctrl+S записва ръчно</p>
            <fieldset className="np-card mt-4 space-y-3 p-3" disabled={readOnly}>
              <legend className="px-1 text-xs font-bold text-ink">Автор и публикуване</legend>
              <div className="flex flex-wrap items-end gap-3">
                <label htmlFor="author-kind" className="min-w-[12rem] flex-1 text-[11px] font-semibold text-muted">
                  Автор
                  <select
                    id="author-kind"
                    aria-label="Публичен автор"
                    value={draft.authorKind}
                    onChange={(event) => selectAuthor(event.target.value as Draft["authorKind"])}
                    className="np-input mt-1"
                  >
                    <option value="staff">{draft.authorKind === "staff" && draft.authorUserId !== staff.id ? `Профил: ${draft.authorName}` : `Моето име: ${staff.name}`}</option>
                    <option value="newsroom">NewsPoint.bg</option>
                    <option value="manual">Друг автор</option>
                  </select>
                </label>
                {draft.authorKind === "manual" ? (
                  <label htmlFor="manual-author" className="min-w-[12rem] flex-1 text-[11px] font-semibold text-muted">
                    Име
                    <input
                      id="manual-author"
                      value={draft.authorName}
                      maxLength={AUTHOR_NAME_MAX}
                      onChange={(event) => update("authorName", event.target.value)}
                      placeholder="Име и фамилия"
                      className="np-input mt-1"
                      autoComplete="off"
                    />
                  </label>
                ) : null}
              </div>
              <div className={published.at ? "opacity-60" : undefined}>
                <p className="text-[0.6875rem] text-muted">Публикуване по час (българско време). Празни полета не пускат новината сами.</p>
                <div className="mt-2 flex flex-wrap items-end gap-2">
                  <label className="text-[11px] font-semibold text-muted">Дата
                    <input type="date" disabled={Boolean(published.at)} value={draft.publishAtSofia?.slice(0, 10) ?? ""} onChange={(event) => {
                      const time = draft.publishAtSofia?.slice(11, 16) || "08:00";
                      update("publishAtSofia", event.target.value ? `${event.target.value}T${time}` : null);
                    }} className="mt-1 block h-8 rounded-md border border-line bg-surface px-2 text-xs text-ink" />
                  </label>
                  <label className="text-[11px] font-semibold text-muted">Час
                    <input type="time" disabled={Boolean(published.at)} value={draft.publishAtSofia?.slice(11, 16) ?? ""} onChange={(event) => {
                      const date = draft.publishAtSofia?.slice(0, 10);
                      update("publishAtSofia", date && event.target.value ? `${date}T${event.target.value}` : null);
                    }} className="mt-1 block h-8 rounded-md border border-line bg-surface px-2 text-xs text-ink" />
                  </label>
                  {draft.publishAtSofia && !published.isPublic ? <button type="button" className="np-btn np-btn-secondary h-8 px-2 text-xs" onClick={() => update("publishAtSofia", null)}>Изчисти</button> : null}
                </div>
                {published.at ? <p className="mt-2 text-[0.6875rem] text-muted">Новината вече е публикувана. Часът важи само преди първото публикуване.</p> : null}
              </div>
              {storyThemeId ? (
                <p className="text-[0.6875rem] text-muted">
                  След запис новината влиза в хронологията на избраната тема{published.isPublic ? " и в публичния roadmap" : " (на сайта ще се види след публикуване)"}.
                </p>
              ) : null}
            </fieldset>
          </div>
        </div>

        <section
          aria-label="Как ще изглежда на сайта"
          className={`min-w-0 flex-col border-line bg-surface-2/70 lg:sticky lg:top-[3.75rem] lg:flex lg:h-[calc(100dvh-3.75rem)] lg:border-l ${mobileTab === "preview" ? "flex" : "hidden"} ${previewCollapsed ? "is-preview-collapsed" : ""}`}
        >
          <div className={`flex items-center gap-1.5 border-b border-line bg-surface/80 ${previewCollapsed ? "flex-col px-1 py-2" : "flex-wrap px-2 py-2 sm:px-3"}`}>
            <button
              type="button"
              onClick={togglePreview}
              aria-pressed={previewCollapsed}
              aria-label={previewCollapsed ? "Покажи прегледа" : "Прибери прегледа"}
              title={previewCollapsed ? "Покажи прегледа" : "Прибери прегледа"}
              className="hidden size-11 shrink-0 items-center justify-center rounded-lg text-ink transition hover:bg-surface-2 lg:inline-flex"
            >
              <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d={previewCollapsed ? "M15 6l-6 6 6 6" : "M9 6l6 6-6 6"} />
              </svg>
            </button>
            {previewCollapsed ? null : (
              <>
            <div className="ml-auto flex flex-wrap items-center gap-1.5">
            <Segmented
              label="Устройство"
              value={device}
              onChange={setDevice}
              options={[
                { value: "desktop", label: "Компютър" },
                { value: "phone", label: "Телефон" },
              ]}
            />
            <Segmented
              label="Тема"
              value={theme}
              onChange={setTheme}
              options={[
                { value: "light", label: "Светла" },
                { value: "dark", label: "Тъмна" },
              ]}
            />
            <button
              type="button"
              disabled={busy || (!articleId && !dirty)}
              onClick={() => void openPreviewTab()}
              title="Записва и отваря прегледа в нов раздел"
              className="np-btn np-btn-secondary px-3 py-1.5 text-xs"
            >
              Цял екран ↗
            </button>
            </div>
              </>
            )}
          </div>

          {previewCollapsed ? null : (
          <div className="flex-1 overflow-y-auto p-3 sm:p-4">
            {device === "desktop" ? (
              <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
                <div className="flex items-center gap-2 border-b border-line bg-surface px-4 py-2.5">
                  <span className="flex gap-1.5" aria-hidden="true">
                    <span className="size-2.5 rounded-full bg-[#ff5f57]" />
                    <span className="size-2.5 rounded-full bg-[#febc2e]" />
                    <span className="size-2.5 rounded-full bg-[#28c840]" />
                  </span>
                  <span className="mx-auto max-w-[80%] truncate rounded-lg bg-surface-2 px-3 py-1 text-[0.6875rem] font-semibold text-muted">{previewUrl}</span>
                </div>
                <ArticlePreview
                  theme={theme}
                  article={{ title: previewSource.title, excerpt: previewSource.excerpt, blocks: previewBlocks, category: previewCategory, hero, heroEmbedUrl: previewSource.heroEmbedUrl, media: availableMedia, authorName: previewSource.authorName, publishedAt: published.at }}
                />
              </div>
            ) : (
              <div className="mx-auto w-[min(390px,100%)] overflow-hidden rounded-[2.75rem] border-[10px] border-shell bg-shell shadow-[0_30px_60px_-30px_rgb(7_13_51/0.6)]">
                <div className="flex justify-center bg-shell pb-1.5" aria-hidden="true">
                  <span className="h-5 w-28 rounded-b-2xl bg-black" />
                </div>
                <div className="max-h-[760px] overflow-y-auto rounded-[2rem]">
                  <ArticlePreview
                    device="phone"
                    theme={theme}
                    article={{ title: previewSource.title, excerpt: previewSource.excerpt, blocks: previewBlocks, category: previewCategory, hero, heroEmbedUrl: previewSource.heroEmbedUrl, media: availableMedia, authorName: previewSource.authorName, publishedAt: published.at }}
                  />
                </div>
              </div>
            )}
          </div>
          )}
        </section>
      </div>

      {leaveDestination ? <EditorDialog label="Незаписани промени" onClose={() => setLeaveDestination(null)}>
        <h3>Има незаписани промени</h3><p>Запишете материала преди да напуснете или останете в редактора.</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="np-btn np-btn-primary" disabled={busy || !editorValid || !!conflict} onClick={() => { const destination = leaveDestination; void save().then(result => { if (result !== null) { allowLeave.current = true; window.location.assign(destination); } }); }}>Запиши и напусни</button>
          <button type="button" className="np-btn np-btn-secondary" onClick={() => setLeaveDestination(null)}>Остани в редактора</button>
          <button type="button" className="np-btn np-btn-secondary" disabled={busy} onClick={() => { allowLeave.current = true; window.location.assign(leaveDestination); }}>Напусни без запис</button>
        </div>
      </EditorDialog> : null}
      {history ? <EditorDialog label="История на версиите" onClose={() => setHistory(null)}>
        <h3>Версии на материала</h3><p>Зареждането заменя текущите полета. Запишете ръчно, за да създадете нова версия. Публикуването е отделно действие.</p>
        <ol>{history.map(item => <li key={item.number} className="my-3 rounded-xl border border-line p-3"><strong>Версия {item.number}</strong> · {formatWhen(item.savedAt)}<p>{item.savedBy ?? "Редактор"} · {item.draft.title}{item.number === published.revision ? " · На сайта" : ""}</p><button type="button" disabled={readOnly || !item.editableBody} className="np-btn np-btn-secondary" onClick={() => { setDraft(current => ({ ...current, title: item.draft.title, slug: published.at ? current.slug : item.draft.slug, excerpt: item.draft.excerpt, ...(item.draft.body ? { body: item.draft.body } : {}), bodyText: item.draft.bodyText, heroMediaId: item.draft.heroMediaId, heroEmbedUrl: item.draft.heroEmbedUrl, authorKind: item.draft.authorKind, authorUserId: item.draft.authorUserId, authorName: item.draft.authorName, primaryCategoryId: item.draft.primaryCategoryId, listenEnabled: item.listenEnabled })); setHistory(null); }}>Зареди версия {item.number}</button></li>)}</ol>
      </EditorDialog> : null}
      {heroDialog ? <EditorDialog label="Водещ embed" onClose={() => setHeroDialog(false)}>
        <h3>Водещ embed</h3><label>HTTPS адрес или iframe код<textarea autoFocus value={heroInput} onChange={event => { setHeroInput(event.target.value); setHeroError(""); }} /></label>
        {parseEmbedInput(heroInput) && embedFrameUrl(parseEmbedInput(heroInput)!.url) ? <div className="np-dialog-embed-preview"><iframe referrerPolicy="strict-origin-when-cross-origin" src={embedFrameUrl(parseEmbedInput(heroInput)!.url)!} title="Преглед на водещия embed" allowFullScreen /></div> : null}
        {heroError ? <p role="alert">{heroError}</p> : null}<button type="button" className="np-btn np-btn-primary" onClick={applyHeroEmbed}>Приложи</button>
      </EditorDialog> : null}
      {pickerOpen ? (
        <MediaPicker
          media={availableMedia}
          selected={mediaTarget === "hero" ? draft.heroMediaId : null}
          multiple={mediaTarget === "body"}
          onClose={() => setPickerOpen(false)}
          onUpload={(item) => {
            rememberMedia([item]);
            if (mediaTarget === "hero") setDraft(current => ({ ...current, heroMediaId: item.id, heroEmbedUrl: null }));
            else visualRef.current?.insertImages([item]);
            setPickerOpen(false);
          }}
          onSelect={(item) => {
            rememberMedia([item]);
            if (mediaTarget === "body") visualRef.current?.insertImages([item]);
            else setDraft(current => ({ ...current, heroMediaId: item.id, heroEmbedUrl: null }));
            setPickerOpen(false);
          }}
          onSelectMany={(items) => {
            rememberMedia(items);
            if (items.length) visualRef.current?.insertImages(items, true);
            setPickerOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}
