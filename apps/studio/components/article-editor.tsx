"use client";

import Link from "next/link";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import type { Conflict, Draft, MediaOption, PublishOutcome } from "@/lib/articles";
import { callApi } from "@/lib/client-api";
import { bodyTextToHtml, htmlToBodyText, textToBody, wordCount } from "@/lib/editor/body";
import { parseEmbedInput } from "@/lib/editor/embed";
import { AUTHOR_NAME_MAX, EXCERPT_MAX, publishProblems, TITLE_MAX } from "@/lib/editor/input";
import { slugify } from "@/lib/editor/slug";
import { formatWhen } from "@/lib/format";
import { browserMediaSrc } from "@/lib/media-src";
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
type Device = "desktop" | "phone";

const sameDraft = (a: Draft, b: Draft) => JSON.stringify(a) === JSON.stringify(b);

function RichEditorSurface({
  value,
  readOnly,
  editorRef,
  onChange,
  onCaret,
}: {
  value: string;
  readOnly: boolean;
  editorRef: React.RefObject<HTMLDivElement | null>;
  onChange: (value: string) => void;
  onCaret?: () => void;
}) {
  const initialized = useRef(false);
  useEffect(() => {
    if (!editorRef.current || initialized.current) return;
    editorRef.current.innerHTML = bodyTextToHtml(value);
    initialized.current = true;
  }, [editorRef, value]);
  const markImages = () => editorRef.current?.querySelectorAll<HTMLImageElement>("img[data-media-id]").forEach((image) => {
    image.draggable = !readOnly;
    image.classList.toggle("studio-editor-draggable-image", !readOnly);
  });
  useEffect(markImages, [readOnly, value]);
  return <div id="body" ref={editorRef} aria-disabled={readOnly} contentEditable={!readOnly} suppressContentEditableWarning
    onInput={(event) => { markImages(); onChange(htmlToBodyText(event.currentTarget.innerHTML)); }}
    onKeyUp={() => onCaret?.()}
    onMouseUp={() => onCaret?.()}
    onBlur={() => onCaret?.()}
    onDragStart={(event) => {
      const image = (event.target as HTMLElement).closest("img[data-media-id]");
      if (!image || readOnly) return;
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", "newspoint-image");
      image.classList.add("studio-editor-dragging-image");
    }}
    onDragEnd={(event) => (event.target as HTMLElement).closest("img[data-media-id]")?.classList.remove("studio-editor-dragging-image")}
    onDragOver={(event) => { if ((event.target as HTMLElement).closest("img[data-media-id]")) event.preventDefault(); }}
    onDrop={(event) => {
      const target = (event.target as HTMLElement).closest("img[data-media-id]");
      const dragged = editorRef.current?.querySelector<HTMLImageElement>(".studio-editor-dragging-image");
      if (!target || !dragged || target === dragged || readOnly) return;
      event.preventDefault();
      target.parentElement?.insertBefore(dragged, target);
      markImages();
      onChange(htmlToBodyText(event.currentTarget.innerHTML));
    }}
    className="studio-rich-editor mt-2 min-h-[17rem] w-full rounded-lg border border-line bg-surface px-3.5 py-3 text-base leading-[1.65] text-body outline-none empty:before:text-faint empty:before:content-[attr(data-placeholder)] focus:border-accent focus:ring-4 focus:ring-accent/10" data-placeholder="Пишете тук…" />;
}

function blockIsEmpty(element: Element): boolean {
  return !element.textContent?.replace(/\u200B/g, "").trim() && !element.querySelector("img, iframe");
}

/** Insert block-level HTML at the saved caret, splitting the current paragraph when needed. */
function insertBlocksAtRange(editor: HTMLElement, html: string, saved: Range | null): Range | null {
  const selection = window.getSelection();
  editor.focus();
  if (saved) {
    try {
      selection?.removeAllRanges();
      selection?.addRange(saved);
    } catch {
      /* stale range after DOM edits */
    }
  }

  const holder = document.createElement("div");
  holder.innerHTML = html;
  const blocks = Array.from(holder.children);
  if (!blocks.length) return saved;

  const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
  let anchor: Element | null = null;
  if (range && editor.contains(range.commonAncestorContainer)) {
    let node: Node | null = range.startContainer;
    while (node && node.parentNode !== editor) node = node.parentNode;
    if (node instanceof Element && node.parentNode === editor) anchor = node;
  }

  let last: Element | null = null;
  const placeAfter = (ref: Node) => {
    let cursor: Node = ref;
    for (const block of blocks) {
      cursor.parentNode!.insertBefore(block, cursor.nextSibling);
      cursor = block;
      last = block;
    }
  };

  if (anchor && range) {
    const splittable = /^(P|H2|H3|BLOCKQUOTE)$/.test(anchor.tagName);
    if (blockIsEmpty(anchor) && anchor.tagName === "P") {
      for (const block of blocks) {
        anchor.parentNode!.insertBefore(block, anchor);
        last = block;
      }
      anchor.remove();
    } else if (splittable && !blockIsEmpty(anchor)) {
      const afterRange = document.createRange();
      afterRange.setStart(range.startContainer, range.startOffset);
      afterRange.setEnd(anchor, anchor.childNodes.length);
      const trailing = afterRange.extractContents();
      placeAfter(anchor);
      const shell = document.createElement(anchor.tagName.toLowerCase());
      shell.appendChild(trailing);
      if (!blockIsEmpty(shell)) last!.parentNode!.insertBefore(shell, last!.nextSibling);
      if (blockIsEmpty(anchor)) anchor.remove();
    } else {
      placeAfter(anchor);
    }
  } else {
    for (const block of blocks) {
      editor.appendChild(block);
      last = block;
    }
  }

  if (!last) return saved;
  const caret = document.createRange();
  caret.setStartAfter(last);
  caret.collapse(true);
  selection?.removeAllRanges();
  selection?.addRange(caret);
  return caret.cloneRange();
}

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
  const [listenEnabled, setListenEnabled] = useState(article.listenEnabled);
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
  const publishKey = useRef<string | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const savedBodyRange = useRef<Range | null>(null);

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

  const rememberBodyRange = () => {
    const selection = window.getSelection();
    if (!selection?.rangeCount || !bodyRef.current) return;
    if (!bodyRef.current.contains(selection.anchorNode)) return;
    try {
      savedBodyRange.current = selection.getRangeAt(0).cloneRange();
    } catch {
      /* ignore */
    }
  };

  /** Keep the caret when focusing a toolbar control (click would otherwise clear it). */
  const keepBodyCaret = (event: React.MouseEvent) => {
    if (bodyLocked) return;
    rememberBodyRange();
    event.preventDefault();
  };

  const openMediaPicker = (target: "body" | "hero") => {
    if (target === "body") rememberBodyRange();
    setMediaTarget(target);
    setPickerOpen(true);
  };

  const insertHtmlAtCaret = (html: string) => {
    if (!bodyRef.current || bodyLocked) return;
    savedBodyRange.current = insertBlocksAtRange(bodyRef.current, html, savedBodyRange.current);
    update("bodyText", htmlToBodyText(bodyRef.current.innerHTML));
  };

  const rememberMedia = (items: MediaOption[]) => {
    if (!items.length) return;
    setAvailableMedia((current) => {
      const map = new Map(current.map((item) => [item.id, item]));
      for (const item of items) map.set(item.id, item);
      return [...map.values()];
    });
  };

  const bodyImageHtml = (item: MediaOption, extras = 'data-size="large" data-align="center" data-shape="rectangle" data-frame="none"') =>
    `<p><img data-media-id="${item.id}" src="${browserMediaSrc(item.url).replace(/"/g, "&quot;")}" alt="" ${extras} /></p>`;

  const insertBodyBlock = (kind: "paragraph" | "heading" | "subheading" | "quote" | "list" | "orderedList") => {
    if (!bodyRef.current || readOnly) return;
    restoreSelectionThen(() => {
      const command = kind === "heading" ? "formatBlock" : kind === "subheading" ? "formatBlock" : kind === "quote" ? "formatBlock" : kind === "list" ? "insertUnorderedList" : kind === "orderedList" ? "insertOrderedList" : "formatBlock";
      const value = kind === "heading" ? "<h2>" : kind === "subheading" ? "<h3>" : kind === "quote" ? "<blockquote>" : "<p>";
      document.execCommand(command, false, value);
      update("bodyText", htmlToBodyText(bodyRef.current!.innerHTML));
    });
  };

  const restoreSelectionThen = (action: () => void) => {
    if (!bodyRef.current) return;
    bodyRef.current.focus();
    if (savedBodyRange.current) {
      const selection = window.getSelection();
      try {
        selection?.removeAllRanges();
        selection?.addRange(savedBodyRange.current);
      } catch {
        /* ignore */
      }
    }
    action();
  };

  const insertInlineFormat = (kind: "bold" | "italic") => {
    if (!bodyRef.current || readOnly) return;
    restoreSelectionThen(() => {
      document.execCommand(kind === "bold" ? "bold" : "italic");
      update("bodyText", htmlToBodyText(bodyRef.current!.innerHTML));
    });
  };

  const editorCommand = (command: string, value?: string) => {
    if (!bodyRef.current || readOnly) return;
    if (command === "createLink") {
      rememberBodyRange();
      const url = window.prompt("HTTPS адрес на връзката:", "https://");
      if (!url?.startsWith("https://")) return;
      restoreSelectionThen(() => {
        document.execCommand(command, false, url);
        update("bodyText", htmlToBodyText(bodyRef.current!.innerHTML));
      });
      return;
    }
    restoreSelectionThen(() => {
      document.execCommand(command, false, value);
      update("bodyText", htmlToBodyText(bodyRef.current!.innerHTML));
    });
  };

  const insertEmbed = () => {
    if (!bodyRef.current || bodyLocked) return;
    rememberBodyRange();
    const raw = window.prompt("Поставете HTTPS линк или целия Facebook/YouTube iframe код:", "");
    if (raw == null) return;
    const parsed = parseEmbedInput(raw);
    if (!parsed) {
      window.alert("Невалиден embed. Поставете https линк или iframe със src=\"https://…\".");
      return;
    }
    insertHtmlAtCaret(`<p><iframe data-embed-provider="${parsed.provider}" src="${parsed.url.replace(/&/g, "&amp;")}"></iframe></p><p><br></p>`);
  };

  const setHeroEmbed = () => {
    const raw = window.prompt("Поставете HTTPS линк или iframe код за hero embed:", draft.heroEmbedUrl ?? "");
    if (raw == null) return;
    const parsed = parseEmbedInput(raw);
    if (!parsed) {
      window.alert("Невалиден embed. Поставете https линк или iframe със src=\"https://…\".");
      return;
    }
    update("heroEmbedUrl", parsed.url);
    update("heroMediaId", null);
  };

  const setImagePresentation = (key: "data-size" | "data-shape" | "data-frame" | "data-align" | "data-focal-x" | "data-focal-y" | "data-crop" | "data-crop-zoom", value: string) => {
    const node = window.getSelection()?.anchorNode;
    const image = node instanceof HTMLImageElement ? node : node?.parentElement?.closest("img[data-media-id]");
    if (!image) return;
    image.setAttribute(key, value);
    if (bodyRef.current) update("bodyText", htmlToBodyText(bodyRef.current.innerHTML));
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
      const themeId = storyThemeId;
      const themeChanged = themeId !== savedStoryThemeId;
      setPhase("saving");
      setNotice(null);

      const assignTheme = async (id: string) => {
        if (!themeChanged) return true;
        const assigned = await callApi("POST", "/api/stories/", { action: "assignArticle", articleId: id, themeId });
        if (!assigned.ok) {
          setNotice({ tone: "error", text: assigned.error.message });
          return false;
        }
        setSavedStoryThemeId(themeId);
        return true;
      };

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
          if (!(await assignTheme(result.data.id))) return null;
          return result.data.revision;
        }

        if (!sameDraft(snapshot, saved)) {
          const result = await callApi<{ revision: number }>("POST", `/api/editor/articles/${idRef.current}/revisions/`, { expectedRevision: expected, draft: snapshot });
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
        setPhase("idle");
      }
    },
    [draft, revision, saved, storyThemeId, savedStoryThemeId],
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
    const result = await callApi<PublishOutcome>("POST", `/api/editor/articles/${idRef.current}/publish/`, { revision: toPublish, idempotencyKey: publishKey.current, listenEnabled });
    setPhase("idle");
    if (!result.ok) {
      if (result.status !== 0) publishKey.current = null;
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
              <label className="inline-flex items-center gap-2 pr-1 text-xs font-bold text-ink">
                <input type="checkbox" checked={listenEnabled} onChange={(event) => setListenEnabled(event.target.checked)} />
                Позволи слушане
              </label>
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
            <div className="studio-editor-classic" role="toolbar" aria-label="WordPress стил редактор">
              <div className="studio-editor-classic-top">
                <button type="button" disabled={bodyLocked} onMouseDown={keepBodyCaret} onClick={() => openMediaPicker("body")} className="studio-editor-media">▣&nbsp; Add Media</button>
              </div>
              <div className="studio-editor-classic-row">
                <button type="button" disabled={bodyLocked} onMouseDown={keepBodyCaret} onClick={() => insertInlineFormat("bold")} className="studio-editor-classic-tool" title="Bold"><strong>B</strong></button>
                <button type="button" disabled={bodyLocked} onMouseDown={keepBodyCaret} onClick={() => insertInlineFormat("italic")} className="studio-editor-classic-tool" title="Italic"><em>I</em></button>
                <button type="button" disabled={bodyLocked} onMouseDown={keepBodyCaret} onClick={() => editorCommand("strikeThrough")} className="studio-editor-classic-tool" title="Strikethrough"><s>ABC</s></button>
                <button type="button" disabled={bodyLocked} onMouseDown={keepBodyCaret} onClick={() => insertBodyBlock("list")} className="studio-editor-classic-tool" title="Bulleted list">☷</button>
                <button type="button" disabled={bodyLocked} onMouseDown={keepBodyCaret} onClick={() => insertBodyBlock("orderedList")} className="studio-editor-classic-tool" title="Numbered list">☷</button>
                <button type="button" disabled={bodyLocked} onMouseDown={keepBodyCaret} onClick={() => insertBodyBlock("quote")} className="studio-editor-classic-tool" title="Blockquote">❝</button>
                <button type="button" disabled={bodyLocked} onMouseDown={keepBodyCaret} onClick={() => editorCommand("insertHorizontalRule")} className="studio-editor-classic-tool" title="Horizontal line">—</button>
                <button type="button" disabled={bodyLocked} onMouseDown={keepBodyCaret} onClick={() => editorCommand("justifyLeft")} className="studio-editor-classic-tool" title="Align left">≡</button>
                <button type="button" disabled={bodyLocked} onMouseDown={keepBodyCaret} onClick={() => editorCommand("justifyCenter")} className="studio-editor-classic-tool" title="Align center">≡</button>
                <button type="button" disabled={bodyLocked} onMouseDown={keepBodyCaret} onClick={() => editorCommand("justifyRight")} className="studio-editor-classic-tool" title="Align right">≡</button>
                <button type="button" disabled={bodyLocked} onMouseDown={keepBodyCaret} onClick={() => editorCommand("createLink")} className="studio-editor-classic-tool" title="Insert link">🔗</button>
                <button type="button" disabled={bodyLocked} onMouseDown={keepBodyCaret} onClick={insertEmbed} className="studio-editor-classic-tool" title="Вгради външна публикация">Embed</button>
              </div>
              <div className="studio-editor-classic-row">
              <select aria-label="Стил на блока" defaultValue="paragraph" disabled={bodyLocked} onChange={(event) => insertBodyBlock(event.target.value as "paragraph" | "heading" | "subheading")} className="studio-editor-classic-select">
                  <option value="paragraph">Paragraph</option><option value="heading">Heading 2</option><option value="subheading">Heading 3</option>
                </select>
                <button type="button" disabled={bodyLocked} onMouseDown={keepBodyCaret} onClick={() => editorCommand("underline")} className="studio-editor-classic-tool" title="Underline"><u>U</u></button>
                <button type="button" disabled={bodyLocked} onMouseDown={keepBodyCaret} onClick={() => editorCommand("justifyFull")} className="studio-editor-classic-tool" title="Justify">≡</button>
                <button type="button" disabled={bodyLocked} className="studio-editor-classic-tool" title="Text color">A</button>
                <button type="button" disabled={bodyLocked} className="studio-editor-classic-tool" title="Paste as text">▣</button>
                <button type="button" disabled={bodyLocked} onMouseDown={keepBodyCaret} onClick={() => editorCommand("removeFormat")} className="studio-editor-classic-tool" title="Clear formatting">⌫</button>
                <button type="button" disabled={bodyLocked} className="studio-editor-classic-tool" title="Special character">Ω</button>
                <button type="button" disabled={bodyLocked} onMouseDown={keepBodyCaret} onClick={() => editorCommand("indent")} className="studio-editor-classic-tool" title="Indent">⇥</button>
                <button type="button" disabled={bodyLocked} onMouseDown={keepBodyCaret} onClick={() => editorCommand("outdent")} className="studio-editor-classic-tool" title="Outdent">⇤</button>
                <button type="button" disabled={bodyLocked} onMouseDown={keepBodyCaret} onClick={() => document.execCommand("undo")} className="studio-editor-classic-tool" title="Undo">↶</button>
                <button type="button" disabled={bodyLocked} onMouseDown={keepBodyCaret} onClick={() => document.execCommand("redo")} className="studio-editor-classic-tool" title="Redo">↷</button>
                <button type="button" disabled={bodyLocked} className="studio-editor-classic-tool" title="Help">?</button>
                <select aria-label="Размер на снимката" defaultValue="" onChange={(event) => event.target.value && setImagePresentation("data-size", event.target.value)} className="studio-editor-classic-select studio-editor-image-select"><option value="">Снимка</option><option value="small">Малка</option><option value="medium">Средна</option><option value="large">Голяма</option><option value="full">Цяла ширина</option></select>
                <select aria-label="Форма на снимката" defaultValue="" onChange={(event) => event.target.value && setImagePresentation("data-shape", event.target.value)} className="studio-editor-classic-select studio-editor-image-select"><option value="">Форма</option><option value="rectangle">Правоъгълна</option><option value="rounded">Заоблена</option><option value="circle">Кръгла</option></select>
                <select aria-label="Рамка на снимката" defaultValue="" onChange={(event) => event.target.value && setImagePresentation("data-frame", event.target.value)} className="studio-editor-classic-select studio-editor-image-select"><option value="">Рамка</option><option value="none">Без рамка</option><option value="soft">Сянка</option><option value="line">Контур</option></select>
                <select aria-label="Кадриране на снимката" defaultValue="" onChange={(event) => event.target.value && setImagePresentation("data-crop", event.target.value)} className="studio-editor-classic-select studio-editor-image-select"><option value="">Кадър</option><option value="original">Оригинал</option><option value="landscape">Пейзаж</option><option value="square">Квадрат</option><option value="portrait">Портрет</option></select>
                <label className="studio-editor-focal-control" title="Фокус по хоризонтала">X <input aria-label="Фокус по хоризонтала" type="range" min="0" max="100" defaultValue="50" onChange={(event) => setImagePresentation("data-focal-x", event.target.value)} /></label>
                <label className="studio-editor-focal-control" title="Фокус по вертикала">Y <input aria-label="Фокус по вертикала" type="range" min="0" max="100" defaultValue="50" onChange={(event) => setImagePresentation("data-focal-y", event.target.value)} /></label>
                <label className="studio-editor-focal-control" title="Приближение на кадъра">Zoom <input aria-label="Приближение на кадъра" type="range" min="100" max="300" defaultValue="100" onChange={(event) => setImagePresentation("data-crop-zoom", event.target.value)} /></label>
              </div>
            </div>
            <RichEditorSurface value={draft.bodyText} readOnly={bodyLocked} editorRef={bodyRef} onChange={(value) => update("bodyText", value)} onCaret={rememberBodyRange} />
            <p className="mt-1.5 text-[0.6875rem] text-faint">Поставете курсора между редовете, после Add Media или Embed. Ctrl+S записва.</p>
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
              <div className={published.isPublic ? "opacity-60" : undefined}>
                <p className="text-[0.6875rem] text-muted">Публикуване по час (българско време). Празни полета не пускат новината сами.</p>
                <div className="mt-2 flex flex-wrap items-end gap-2">
                  <label className="text-[11px] font-semibold text-muted">Дата
                    <input type="date" disabled={published.isPublic} value={draft.publishAtSofia?.slice(0, 10) ?? ""} onChange={(event) => {
                      const time = draft.publishAtSofia?.slice(11, 16) || "08:00";
                      update("publishAtSofia", event.target.value ? `${event.target.value}T${time}` : null);
                    }} className="mt-1 block h-8 rounded-md border border-line bg-surface px-2 text-xs text-ink" />
                  </label>
                  <label className="text-[11px] font-semibold text-muted">Час
                    <input type="time" disabled={published.isPublic} value={draft.publishAtSofia?.slice(11, 16) ?? ""} onChange={(event) => {
                      const date = draft.publishAtSofia?.slice(0, 10);
                      update("publishAtSofia", date && event.target.value ? `${date}T${event.target.value}` : null);
                    }} className="mt-1 block h-8 rounded-md border border-line bg-surface px-2 text-xs text-ink" />
                  </label>
                  {draft.publishAtSofia && !published.isPublic ? <button type="button" className="np-btn np-btn-secondary h-8 px-2 text-xs" onClick={() => update("publishAtSofia", null)}>Изчисти</button> : null}
                </div>
                {published.isPublic ? <p className="mt-2 text-[0.6875rem] text-muted">Новината вече е на сайта. Часът важи само преди първото публикуване.</p> : null}
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

      {pickerOpen ? (
        <MediaPicker
          media={availableMedia}
          selected={draft.heroMediaId}
          multiple={mediaTarget === "body"}
          onClose={() => setPickerOpen(false)}
          onUpload={(item) => {
            rememberMedia([item]);
            if (mediaTarget === "hero") update("heroMediaId", item.id);
            else insertHtmlAtCaret(`${bodyImageHtml(item)}<p><br></p>`);
            setPickerOpen(false);
          }}
          onSelect={(item) => {
            rememberMedia([item]);
            if (mediaTarget === "body") insertHtmlAtCaret(`${bodyImageHtml(item)}<p><br></p>`);
            else update("heroMediaId", item.id);
            setPickerOpen(false);
          }}
          onSelectMany={(items) => {
            rememberMedia(items);
            if (items.length) {
              const group = crypto.randomUUID();
              const extras = `data-group-id="${group}" data-size="medium" data-align="center" data-shape="rounded" data-frame="none"`;
              insertHtmlAtCaret(`${items.map((item) => bodyImageHtml(item, extras)).join("")}<p><br></p>`);
            }
            setPickerOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}
