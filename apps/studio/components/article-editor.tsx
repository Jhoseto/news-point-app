"use client";

import Link from "next/link";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import type { Conflict, Draft, MediaOption, PublishOutcome } from "@/lib/articles";
import { callApi } from "@/lib/client-api";
import { textToBody, wordCount } from "@/lib/editor/body";
import { AUTHOR_NAME_MAX, EXCERPT_MAX, publishProblems, TITLE_MAX } from "@/lib/editor/input";
import { slugify } from "@/lib/editor/slug";
import { formatWhen } from "@/lib/format";
import { withBase } from "@/lib/paths";
import { ArticlePreview, type PreviewTheme } from "./article-preview";
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
  };
  draft: Draft;
  sections: { id: string; name: string }[];
  media: MediaOption[];
  webUrl: string;
}

type Notice = { tone: "error" | "success"; text: string; href?: string };
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

export function ArticleEditor({ article, draft: initialDraft, staff, sections, media, webUrl }: EditorProps) {
  const [articleId, setArticleId] = useState(article.id);
  const idRef = useRef(article.id);
  const [draft, setDraft] = useState(initialDraft);
  const [saved, setSaved] = useState(initialDraft);
  const [revision, setRevision] = useState(article.revision);
  const [savedAt, setSavedAt] = useState(article.revisionSavedAt);
  const [slugTouched, setSlugTouched] = useState(Boolean(initialDraft.slug));
  const [phase, setPhase] = useState<"idle" | "saving" | "publishing">("idle");
  const [conflict, setConflict] = useState<Conflict | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [published, setPublished] = useState({ isPublic: article.isPublic, revision: article.publishedRevision, path: article.path, at: article.publishedAt });
  const [pickerOpen, setPickerOpen] = useState(false);
  const [device, setDevice] = useState<Device>("desktop");
  const [theme, setTheme] = useState<PreviewTheme>("light");
  const [mobileTab, setMobileTab] = useState<"edit" | "preview">("edit");
  const publishKey = useRef<string | null>(null);

  const readOnly = !article.canEdit;
  const dirty = !sameDraft(draft, saved);
  const busy = phase !== "idle";
  const hero = media.find((item) => item.id === draft.heroMediaId) ?? null;
  const words = wordCount(draft.bodyText);

  const previewSource = useDeferredValue(draft);
  const previewBlocks = useMemo(() => textToBody(previewSource.bodyText), [previewSource.bodyText]);
  const previewCategory = sections.find((section) => section.id === previewSource.primaryCategoryId)?.name ?? null;

  const update = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((current) => {
      const next = { ...current, [key]: value };
      if (key === "title" && !slugTouched && !published.isPublic) next.slug = slugify(String(value));
      return next;
    });
    setProblems([]);
    if (notice?.tone === "success") setNotice(null);
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
      const snapshot = draft;
      setPhase("saving");
      setNotice(null);
      try {
        if (!idRef.current) {
          const result = await callApi<{ id: string; revision: number }>("POST", "/api/editor/articles/", snapshot);
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
          return result.data.revision;
        }
        const result = await callApi<{ revision: number }>("POST", `/api/editor/articles/${idRef.current}/revisions/`, { expectedRevision: expected, draft: snapshot });
        if (!result.ok) {
          if (result.status === 409 && result.error.code === "conflict") setConflict(result.error.details as Conflict);
          else setNotice({ tone: "error", text: result.error.message });
          return null;
        }
        setConflict(null);
        setSaved(snapshot);
        setRevision(result.data.revision);
        setSavedAt(new Date().toISOString());
        return result.data.revision;
      } finally {
        setPhase("idle");
      }
    },
    [draft, revision],
  );

  async function publish() {
    const blocking = publishProblems({ ...draft, bodyBlocks: textToBody(draft.bodyText).length });
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
    publishKey.current ??= crypto.randomUUID();
    setPhase("publishing");
    const result = await callApi<PublishOutcome>("POST", `/api/editor/articles/${idRef.current}/publish/`, { revision: toPublish, idempotencyKey: publishKey.current });
    setPhase("idle");
    if (!result.ok) {
      if (result.status !== 0) publishKey.current = null;
      if (result.status === 422 && Array.isArray(result.error.details)) setProblems(result.error.details as string[]);
      else setNotice({ tone: "error", text: result.error.message });
      return;
    }
    publishKey.current = null;
    setPublished((current) => ({ isPublic: true, revision: result.data.revision, path: result.data.path, at: current.at ?? new Date().toISOString() }));
    setNotice({
      tone: "success",
      text: result.data.type === "article.published" ? "Статията е публикувана. Читателите я виждат веднага." : "Публикацията е обновена.",
      href: `${webUrl}${result.data.path}`,
    });
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
        if (!readOnly && !busy && dirty) void save();
      }
    };
    const onLeave = (event: BeforeUnloadEvent) => {
      if (dirty) event.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("beforeunload", onLeave);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("beforeunload", onLeave);
    };
  }, [busy, dirty, readOnly, save]);

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
  const previewUrl = `newspoint.bg/${draft.slug || "adres-na-statiyata"}/`;

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

          {!readOnly ? (
            <div className="ml-auto flex items-center gap-1.5">
              <button type="button" disabled={busy || (!dirty && Boolean(articleId))} onClick={() => void save()} className="np-btn np-btn-secondary px-3 py-1.5 text-xs">
                {phase === "saving" ? "Записване…" : "Запиши"}
              </button>
              <button type="button" disabled={busy || Boolean(conflict)} onClick={() => void publish()} className="np-btn np-btn-primary px-4 py-1.5 text-xs">
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

      <div className="grid flex-1 lg:grid-cols-2">
        <div className={`min-w-0 space-y-3 px-3 py-4 sm:px-5 lg:block lg:py-5 xl:px-7 ${mobileTab === "edit" ? "" : "hidden"}`}>
          {readOnly ? (
            <p className="rounded-2xl border border-line bg-surface-2 px-5 py-3.5 text-sm font-semibold text-body">
              Статията е импортирана от WordPress и засега е само за преглед. Редакцията на архива идва с новия редактор.
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

          <div className="np-card p-4">
            <label htmlFor="title" className="np-label">
              Заглавие
            </label>
            <textarea
              id="title"
              rows={1}
              maxLength={TITLE_MAX}
              value={draft.title}
              disabled={readOnly}
              onChange={(event) => update("title", event.target.value.replace(/\n/g, " "))}
              placeholder="Заглавие на материала"
              className="w-full resize-none bg-transparent text-xl leading-tight font-extrabold tracking-tight text-ink outline-none [field-sizing:content] placeholder:text-faint sm:text-[1.4rem]"
            />
            <div className="mt-2 flex flex-wrap items-center gap-1 border-t border-line pt-2 text-xs text-muted">
              <span className="font-semibold">Адрес:</span>
              <span className="text-faint">newspoint.bg/</span>
              <input
                aria-label="Адрес на статията"
                value={draft.slug}
                disabled={readOnly || published.isPublic}
                onChange={(event) => {
                  setSlugTouched(true);
                  update("slug", event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"));
                }}
                placeholder="adres-na-statiyata"
                className="min-w-40 flex-1 rounded-md bg-transparent px-1 py-0.5 font-semibold text-ink outline-none focus:bg-surface-2 disabled:text-muted"
              />
              {published.isPublic ? <span className="text-xs text-faint">(не се сменя след публикуване)</span> : null}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="np-card p-4">
              <label htmlFor="category" className="np-label">
                Рубрика
              </label>
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
            </div>

            <div className="np-card flex items-center gap-3 p-4">
              {hero ? (
                <img src={hero.url} alt={hero.alt} className="aspect-[4/3] w-16 shrink-0 rounded-lg bg-surface-2 object-cover" />
              ) : (
                <div className="flex aspect-[4/3] w-16 shrink-0 items-center justify-center rounded-lg border border-dashed border-line text-[0.625rem] font-bold text-faint">
                  Няма
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="np-label">Основна снимка</p>
                {!readOnly ? (
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => setPickerOpen(true)} className="np-btn np-btn-secondary px-3 py-1.5">
                      {hero ? "Смени" : "Избери"}
                    </button>
                    {hero ? (
                      <button type="button" onClick={() => update("heroMediaId", null)} className="np-btn np-btn-secondary px-3 py-1.5">
                        Махни
                      </button>
                    ) : null}
                  </div>
                ) : (
                  <p className="truncate text-sm text-muted">{hero?.alt || "—"}</p>
                )}
              </div>
            </div>
          </div>

          <fieldset className="np-card p-4" disabled={readOnly}>
            <legend className="np-label px-1">Публичен автор</legend>
            <div className="grid gap-1.5 sm:grid-cols-3">
              {([
                ["staff", draft.authorKind === "staff" && draft.authorUserId !== staff.id ? `Профил: ${draft.authorName}` : `Моето име: ${staff.name}`],
                ["newsroom", "NewsPoint.bg"],
                ["manual", "Друг автор"],
              ] as const).map(([kind, label]) => (
                <button
                  key={kind}
                  type="button"
                  aria-pressed={draft.authorKind === kind}
                  onClick={() => selectAuthor(kind)}
                  className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-left text-xs font-bold text-body transition hover:border-accent/50 hover:text-ink aria-pressed:border-accent aria-pressed:bg-accent/5 aria-pressed:text-accent disabled:cursor-default"
                >
                  <span className="flex items-center gap-2">
                    <span className="flex size-3.5 shrink-0 items-center justify-center rounded-full border border-current">
                      {draft.authorKind === kind ? <span className="size-1.5 rounded-full bg-current" /> : null}
                    </span>
                    {label}
                  </span>
                </button>
              ))}
            </div>
            {draft.authorKind === "manual" ? (
              <div className="mt-3 grid items-end gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                <div>
                <label htmlFor="manual-author" className="np-label">Име на автора</label>
                <input
                  id="manual-author"
                  value={draft.authorName}
                  maxLength={AUTHOR_NAME_MAX}
                  onChange={(event) => update("authorName", event.target.value)}
                  placeholder="Име и фамилия"
                  className="np-input"
                  autoComplete="off"
                />
                </div>
                <p className="pb-2.5 text-xs text-faint">Текстов подпис без авторски профил.</p>
              </div>
            ) : null}
          </fieldset>

          <div className="np-card p-4">
            <label htmlFor="excerpt" className="np-label">
              Кратко резюме
            </label>
            <textarea
              id="excerpt"
              rows={2}
              maxLength={EXCERPT_MAX}
              value={draft.excerpt}
              disabled={readOnly}
              onChange={(event) => update("excerpt", event.target.value)}
              placeholder="Едно-две изречения, които се показват под заглавието и в картите."
              className="np-input resize-none [field-sizing:content]"
            />

            <div className="mt-4 flex items-end justify-between gap-3 border-t border-line pt-4">
              <label htmlFor="body" className="np-label mb-0">
                Текст
              </label>
              <span className="text-xs text-faint tabular-nums">{words} думи</span>
            </div>
            {!article.editableBody ? <p className="mt-2 text-sm text-warning">Текстът съдържа елементи, които този редактор още не поддържа.</p> : null}
            <textarea
              id="body"
              value={draft.bodyText}
              disabled={readOnly}
              onChange={(event) => update("bodyText", event.target.value)}
              placeholder={"Пишете тук. Празен ред започва нов абзац.\n\n## Подзаглавие\n\n> Цитат"}
              className="mt-2 min-h-[17rem] w-full resize-y rounded-lg border border-line bg-surface px-3.5 py-3 text-base leading-[1.65] text-body outline-none [field-sizing:content] placeholder:text-faint focus:border-accent focus:ring-4 focus:ring-accent/10 disabled:bg-surface-2"
            />
            <p className="mt-2 text-xs text-faint">Празен ред = нов абзац · „## “ = подзаглавие · „&gt; “ = цитат · Ctrl+S записва</p>
          </div>
        </div>

        <section
          aria-label="Как ще изглежда на сайта"
          className={`min-w-0 flex-col border-line bg-surface-2/70 lg:sticky lg:top-[3.75rem] lg:flex lg:h-[calc(100dvh-3.75rem)] lg:border-l ${mobileTab === "preview" ? "flex" : "hidden"}`}
        >
          <div className="flex flex-wrap items-center gap-1.5 border-b border-line bg-surface/80 px-4 py-2 sm:px-5">
            <span className="mr-auto inline-flex items-center gap-2 text-xs font-extrabold tracking-wide text-ink uppercase">
              <span className="relative flex size-2">
                <span className="absolute inset-0 animate-ping rounded-full bg-success/60" aria-hidden="true" />
                <span className="relative size-2 rounded-full bg-success" aria-hidden="true" />
              </span>
              На живо
            </span>
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
                  article={{ title: previewSource.title, excerpt: previewSource.excerpt, blocks: previewBlocks, category: previewCategory, hero, authorName: previewSource.authorName, publishedAt: published.at }}
                />
              </div>
            ) : (
              <div className="mx-auto w-[min(390px,100%)] overflow-hidden rounded-[2.75rem] border-[10px] border-shell bg-shell shadow-[0_30px_60px_-30px_rgb(7_13_51/0.6)]">
                <div className="flex justify-center bg-shell pb-1.5" aria-hidden="true">
                  <span className="h-5 w-28 rounded-b-2xl bg-black" />
                </div>
                <div className="max-h-[760px] overflow-y-auto rounded-[2rem]">
                  <ArticlePreview
                    theme={theme}
                    article={{ title: previewSource.title, excerpt: previewSource.excerpt, blocks: previewBlocks, category: previewCategory, hero, authorName: previewSource.authorName, publishedAt: published.at }}
                  />
                </div>
              </div>
            )}
          </div>
        </section>
      </div>

      {pickerOpen ? (
        <MediaPicker
          media={media}
          selected={draft.heroMediaId}
          onClose={() => setPickerOpen(false)}
          onSelect={(id) => {
            update("heroMediaId", id);
            setPickerOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}
