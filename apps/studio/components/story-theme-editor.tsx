"use client";

import { useDeferredValue, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { withBase } from "@/lib/paths";
import { slugify } from "@/lib/editor/slug";
import { MediaPicker } from "@/components/media-picker";
import { StoryArticleSearch } from "@/components/story-article-search";
import type { MediaOption } from "@/lib/articles";
import type { StoryThemeArticleEntry, StoryThemeDetail, StoryThemeInput } from "@/lib/story-theme-types";

const TITLE_LIMIT = 160;
const SUMMARY_LIMIT = 280;
const INTRO_LIMIT = 4000;
const CAPTION_LIMIT = 280;

type Mode = "create" | "edit";

type CoverSelection = { id: string | null; url: string | null };

type ArticleSelection = { id: string; title: string; path: string; categoryName: string | null; heroUrl: string | null; publishedAt: Date | null; isPublic: boolean };

function normalizeCover(cover: { coverMediaId: string | null; coverUrl: string | null } | undefined): CoverSelection {
  return { id: cover?.coverMediaId ?? null, url: cover?.coverUrl ?? null };
}

function toInput(theme: StoryThemeDetail): StoryThemeInput {
  return {
    slug: theme.slug,
    title: theme.title,
    summary: theme.summary,
    intro: theme.intro,
    coverMediaId: theme.coverMediaId,
    coverCaption: theme.coverCaption,
  };
}

function articleEntryToSelection(entry: StoryThemeArticleEntry): ArticleSelection {
  return {
    id: entry.articleId,
    title: entry.title,
    path: entry.path,
    categoryName: entry.categoryName,
    heroUrl: entry.heroUrl,
    publishedAt: entry.publishedAt,
    isPublic: entry.isPublic,
  };
}

export function StoryThemeEditor({ mode, theme, mediaOptions = [] }: { mode: Mode; theme?: StoryThemeDetail; mediaOptions?: MediaOption[] }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const initialInput = useMemo(() => (theme ? toInput(theme) : null), [theme]);
  const [title, setTitle] = useState(initialInput?.title ?? "");
  const [slug, setSlug] = useState(initialInput?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(Boolean(initialInput?.slug));
  const [summary, setSummary] = useState(initialInput?.summary ?? "");
  const [intro, setIntro] = useState(initialInput?.intro ?? "");
  const [cover, setCover] = useState<CoverSelection>(normalizeCover(theme));
  const [coverCaption, setCoverCaption] = useState(initialInput?.coverCaption ?? "");
  const [articles, setArticles] = useState<ArticleSelection[]>(
    theme ? theme.articles.map(articleEntryToSelection) : [],
  );
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerInitial, setPickerInitial] = useState<ArticleSelection[]>([]);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const deferredTitle = useDeferredValue(title);
  const [coverPickerOpen, setCoverPickerOpen] = useState(false);

  useEffect(() => {
    if (slugTouched) return;
    if (!deferredTitle.trim()) return;
    const next = slugify(deferredTitle);
    if (next && next !== slug) setSlug(next);
  }, [deferredTitle, slug, slugTouched]);

  // Sync local state from theme prop. After `create` we call router.refresh()
  // which re-renders this component with the new theme; we want our local
  // articles and metadata to match the saved version so the editor stays
  // consistent with the server.
  useEffect(() => {
    if (!theme) return;
    if (title === "" && theme.title) setTitle(theme.title);
    if (summary === "" && theme.summary) setSummary(theme.summary);
    if (intro === "" && theme.intro) setIntro(theme.intro);
    if (cover.id === null && theme.coverMediaId) {
      setCover({ id: theme.coverMediaId, url: null });
    }
    if (coverCaption === "" && theme.coverCaption) setCoverCaption(theme.coverCaption);
    setArticles(theme.articles.map(articleEntryToSelection));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme?.id]);

  const dirty =
    mode === "edit"
      ? title !== (initialInput?.title ?? "") ||
        slug !== (initialInput?.slug ?? "") ||
        summary !== (initialInput?.summary ?? "") ||
        intro !== (initialInput?.intro ?? "") ||
        cover.id !== (initialInput?.coverMediaId ?? null) ||
        coverCaption !== (initialInput?.coverCaption ?? "") ||
        JSON.stringify(articles.map((a) => a.id)) !== JSON.stringify(theme?.articles.map((a) => a.articleId) ?? [])
      : title.length > 0;

  const send = async (action: "create" | "save" | "publish" | "unpublish" | "addArticle" | "removeArticle" | "reorder", extra?: Record<string, unknown>) => {
    if (action !== "publish" && pending) return;
    if (action === "create" || action === "save") {
      if (title.trim().length < 5) {
        setFeedback({ kind: "err", text: "Заглавието трябва да е поне 5 символа." });
        return;
      }
    }
    if (action === "publish" && articles.length < 1) {
      setFeedback({ kind: "err", text: "Добавете поне една статия преди публикуване." });
      return;
    }
    setPending(true);
    setFeedback(null);
    try {
      const payload: Record<string, unknown> = { action };
      if (action === "create" || action === "save") {
        payload.slug = slug;
        payload.title = title;
        payload.summary = summary;
        payload.intro = intro;
        payload.coverMediaId = cover.id;
        payload.coverCaption = coverCaption;
      }
      // Only `create` includes articleIds — `save` in edit mode must not
      // clobber the canonical article set that's already been committed via
      // the individual addArticle / removeArticle / reorder actions.
      if (action === "create") {
        payload.articleIds = articles.map((a) => a.id);
      }
      if (action === "create" || action === "save" || action === "publish") {
        if (theme?.id) payload.id = theme.id;
      }
      if (extra) Object.assign(payload, extra);
      const res = await fetch("/api/stories", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: { message?: string } }).error?.message ?? `Грешка ${res.status}`);
      }
      const data = (await res.json().catch(() => ({}))) as { id?: string; slug?: string; action?: string };
      setFeedback({ kind: "ok", text: successMessage(action, data) });
      if (action === "create" && data.id) {
        // Don't navigate away — keep the editor instance and refresh so the
        // user can add more articles without losing their in-progress picks.
        startTransition(() => router.refresh());
      } else {
        startTransition(() => router.refresh());
      }
    } catch (err) {
      setFeedback({ kind: "err", text: err instanceof Error ? err.message : "Грешка при заявката." });
    } finally {
      setPending(false);
    }
  };

  const reorder = async (orderedIds: string[]) => {
    if (!theme) return;
    setPending(true);
    try {
      const res = await fetch("/api/stories", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "reorder", themeId: theme.id, articleIds: orderedIds }),
      });
      if (!res.ok) throw new Error(`Грешка ${res.status}`);
      startTransition(() => router.refresh());
    } catch (err) {
      setFeedback({ kind: "err", text: err instanceof Error ? err.message : "Грешка при пренареждане." });
    } finally {
      setPending(false);
    }
  };

  const removeArticle = async (articleId: string) => {
    if (!theme) return;
    setPending(true);
    try {
      const res = await fetch("/api/stories", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "removeArticle", themeId: theme.id, articleId }),
      });
      if (!res.ok) throw new Error(`Грешка ${res.status}`);
      setArticles((current) => current.filter((a) => a.id !== articleId));
      startTransition(() => router.refresh());
    } catch (err) {
      setFeedback({ kind: "err", text: err instanceof Error ? err.message : "Грешка при премахване." });
    } finally {
      setPending(false);
    }
  };

  const openPicker = (existing: ArticleSelection[]) => {
    setPickerInitial(existing);
    setPickerOpen(true);
  };

  const onPickerConfirm = (selected: ArticleSelection[]) => {
    setPickerOpen(false);
    setArticles(selected);
  };

  const onMoveUp = (index: number) => {
    if (index === 0) return;
    const next = articles.slice();
    [next[index - 1], next[index]] = [next[index]!, next[index - 1]!];
    setArticles(next);
    if (theme) void reorder(next.map((a) => a.id));
  };

  const onMoveDown = (index: number) => {
    if (index === articles.length - 1) return;
    const next = articles.slice();
    [next[index], next[index + 1]] = [next[index + 1]!, next[index]!];
    setArticles(next);
    if (theme) void reorder(next.map((a) => a.id));
  };

  return (
    <div className="flex flex-col gap-5">
      {feedback ? (
        <div
          role={feedback.kind === "err" ? "alert" : "status"}
          className={`np-card p-3 text-sm ${feedback.kind === "err" ? "border-danger/40 text-danger" : "border-success/40 text-success"}`}
        >
          {feedback.text}
        </div>
      ) : null}

      <section className="np-card flex flex-col gap-4 p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="np-label gap-1">
            <span className="text-xs font-bold tracking-wide text-muted uppercase">Заглавие</span>
            <input
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value.slice(0, TITLE_LIMIT))}
              placeholder="Например: Големият пожар в Пловдив — хронология"
              className="np-input"
            />
            <span className="text-xs text-faint">{title.length} / {TITLE_LIMIT}</span>
          </label>
          <label className="np-label gap-1">
            <span className="text-xs font-bold tracking-wide text-muted uppercase">URL адрес</span>
            <input
              type="text"
              value={slug}
              onChange={(event) => {
                setSlugTouched(true);
                setSlug(event.target.value.slice(0, 80));
              }}
              placeholder="golemiyat-pozhar-v-plovdiv"
              className="np-input font-mono text-sm"
            />
            <span className="text-xs text-faint">/temi/{slug || "..."}/ · малки букви, цифри, тирета</span>
          </label>
        </div>
        <label className="np-label gap-1">
          <span className="text-xs font-bold tracking-wide text-muted uppercase">Кратко описание (за картата)</span>
          <textarea
            value={summary}
            onChange={(event) => setSummary(event.target.value.slice(0, SUMMARY_LIMIT))}
            rows={2}
            placeholder="Едно-две изречения за показване в индекса."
            className="np-input resize-y"
          />
          <span className="text-xs text-faint">{summary.length} / {SUMMARY_LIMIT}</span>
        </label>
        <label className="np-label gap-1">
          <span className="text-xs font-bold tracking-wide text-muted uppercase">Въведение (за страницата с хронология)</span>
          <textarea
            value={intro}
            onChange={(event) => setIntro(event.target.value.slice(0, INTRO_LIMIT))}
            rows={6}
            placeholder="По-подробен текст за контекста на историята."
            className="np-input resize-y"
          />
          <span className="text-xs text-faint">{intro.length} / {INTRO_LIMIT}</span>
        </label>
      </section>

      <section className="np-card flex flex-col gap-4 p-5">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold tracking-wide text-muted uppercase">Корица</h2>
            <p className="mt-1 text-xs text-faint">Показва се в горната част на публичната страница.</p>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-[12rem_1fr]">
          <div className="aspect-[16/9] overflow-hidden rounded-2xl border border-line bg-surface-2">
            {cover.url ? (
              <img src={cover.url} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-xs text-muted">Няма корица</div>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => setCoverPickerOpen(true)}
              className="np-btn np-btn-secondary !w-fit"
            >
              {cover.url ? "Смени корицата" : "Избери корица"}
            </button>
            {cover.url ? (
              <button
                type="button"
                onClick={() => setCover({ id: null, url: null })}
                className="np-btn np-btn-secondary !w-fit text-danger"
              >
                Премахни корицата
              </button>
            ) : null}
            <label className="np-label gap-1">
              <span className="text-xs font-bold tracking-wide text-muted uppercase">Надпис</span>
              <input
                type="text"
                value={coverCaption}
                onChange={(event) => setCoverCaption(event.target.value.slice(0, CAPTION_LIMIT))}
                placeholder="Например: Снимка: БГНЕС"
                className="np-input"
              />
              <span className="text-xs text-faint">{coverCaption.length} / {CAPTION_LIMIT}</span>
            </label>
          </div>
        </div>
      </section>

      <section className="np-card flex flex-col gap-4 p-5">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold tracking-wide text-muted uppercase">Статии в темата</h2>
            <p className="mt-1 text-xs text-faint">
              {articles.length === 0
                ? "Добавете поне една публикувана статия."
                : `${articles.length} ${articles.length === 1 ? "статия" : "статии"} в хронологията.`}
            </p>
          </div>
          <button
            type="button"
            onClick={() => openPicker(articles)}
            className="np-btn np-btn-secondary"
          >
            {articles.length === 0 ? "+ Добави статии" : "Управление на статиите"}
          </button>
        </div>
        {articles.length ? (
          <ol className="flex flex-col gap-1">
            {articles.map((article, index) => (
              <li
                key={article.id}
                className="flex items-center gap-3 rounded-xl border border-line bg-surface px-3 py-2"
              >
                <span className="font-mono text-xs text-faint tabular-nums w-6 text-right">
                  {index + 1}
                </span>
                {article.heroUrl ? (
                  <img src={article.heroUrl} alt="" className="size-12 rounded-md object-cover" />
                ) : (
                  <span className="size-12 rounded-md bg-surface-2" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-bold text-ink">{article.title}</div>
                  <div className="truncate text-xs text-muted">
                    {article.categoryName ? `${article.categoryName} · ` : ""}/ {article.path}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => onMoveUp(index)}
                    disabled={index === 0 || pending}
                    className="np-btn np-btn-secondary !h-8 !w-8 !p-0"
                    aria-label="Нагоре"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => onMoveDown(index)}
                    disabled={index === articles.length - 1 || pending}
                    className="np-btn np-btn-secondary !h-8 !w-8 !p-0"
                    aria-label="Надолу"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={() => void removeArticle(article.id)}
                    disabled={pending}
                    className="np-btn np-btn-secondary !h-8 !px-3 !text-xs text-danger"
                  >
                    Махни
                  </button>
                </div>
              </li>
            ))}
          </ol>
        ) : null}
      </section>

      <div className="flex flex-wrap items-center justify-end gap-2">
        {mode === "create" ? (
          <button
            type="button"
            onClick={() => void send("create")}
            disabled={pending}
            className="np-btn np-btn-primary"
          >
            {pending ? "Запазване..." : "Създай тема"}
          </button>
        ) : (
          <>
            {theme?.isPublished ? (
              <button
                type="button"
                onClick={() => void send("unpublish")}
                disabled={pending}
                className="np-btn np-btn-secondary"
              >
                Свали от публикация
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void send("publish")}
                disabled={pending}
                className="np-btn np-btn-primary"
              >
                Публикувай
              </button>
            )}
            <button
              type="button"
              onClick={() => void send("save")}
              disabled={pending || !dirty}
              className="np-btn np-btn-primary"
            >
              {pending ? "Запазване..." : "Запази промените"}
            </button>
          </>
        )}
      </div>

      {pickerOpen ? (
        <StoryArticleSearch
          open={pickerOpen}
          initial={pickerInitial}
          onClose={() => setPickerOpen(false)}
          onConfirm={onPickerConfirm}
        />
      ) : null}
      {coverPickerOpen ? (
        <MediaPicker
          media={mediaOptions}
          selected={cover.id}
          onClose={() => setCoverPickerOpen(false)}
          onSelect={(id) => {
            const asset = mediaOptions.find((item) => item.id === id);
            if (asset) setCover({ id, url: asset.url });
            setCoverPickerOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}

function successMessage(action: string, data: { id?: string; slug?: string; action?: string }) {
  if (action === "create") return "Темата е създадена.";
  if (action === "save") return "Промените са запазени.";
  if (action === "publish") return "Темата е публикувана.";
  return "Готово.";
}
