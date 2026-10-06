"use client";

import { useEffect, useMemo, useState } from "react";
import { browserMediaSrc } from "@/lib/media-src";
import { withBase } from "@/lib/paths";
import { sortThemeArticlesChronologically } from "@/lib/story-theme-order";
import type { StoryThemeArticleSearchResult } from "@/lib/story-theme-types";

type Selection = StoryThemeArticleSearchResult;

type Props = {
  open: boolean;
  initial: Selection[];
  onClose: () => void;
  onConfirm: (next: Selection[]) => void;
};

const PAGE_SIZE = 50;

function formatDate(value: Date | string | null) {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("bg-BG", { day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
}

function mergeCatalog(current: Map<string, Selection>, extras: Selection[]) {
  const next = new Map(current);
  for (const article of extras) next.set(article.id, article);
  return next;
}

export function StoryArticleSearch({ open, initial, onClose, onConfirm }: Props) {
  const initialIds = useMemo(() => new Set(initial.map((a) => a.id)), [initial]);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<Selection[]>([]);
  const [catalog, setCatalog] = useState<Map<string, Selection>>(() => new Map(initial.map((a) => [a.id, a])));
  const [selected, setSelected] = useState<Set<string>>(initialIds);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setSelected(new Set(initialIds));
    setCatalog((current) => mergeCatalog(current, initial));
  }, [open, initial, initialIds]);

  useEffect(() => {
    if (!open) return;
    const handle = setTimeout(() => {
      void loadPage(search, 0, false);
    }, 250);
    return () => clearTimeout(handle);
    // loadPage is stable enough for this picker; search/open are the triggers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, open]);

  const loadPage = async (query: string, offset: number, append: boolean) => {
    setLoading(true);
    setError(null);
    try {
      const url = withBase(
        `/api/stories/search-articles?q=${encodeURIComponent(query)}&limit=${PAGE_SIZE}&offset=${offset}`,
      );
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error(`Грешка ${res.status}`);
      const data = (await res.json()) as { articles: Selection[]; hasMore?: boolean };
      setResults((current) => (append ? [...current, ...data.articles] : data.articles));
      setCatalog((current) => mergeCatalog(current, data.articles));
      setHasMore(Boolean(data.hasMore));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Грешка при търсене.");
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  const toggle = (article: Selection) => {
    setCatalog((current) => mergeCatalog(current, [article]));
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(article.id)) next.delete(article.id);
      else next.add(article.id);
      return next;
    });
  };

  const onConfirmClick = () => {
    const picked: Selection[] = [];
    for (const id of selected) {
      const found = catalog.get(id);
      if (found) picked.push(found);
    }
    onConfirm(sortThemeArticlesChronologically(picked));
  };

  const selectedArticles = [...selected]
    .map((id) => catalog.get(id))
    .filter((article): article is Selection => Boolean(article));

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Управление на статии в тема"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="np-card flex max-h-[80vh] w-full max-w-3xl flex-col"
      >
        <header className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="text-base font-extrabold tracking-tight text-ink">Управление на статии</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Затвори"
            className="inline-flex size-8 items-center justify-center rounded-full text-muted hover:bg-surface-2 hover:text-ink"
          >
            ✕
          </button>
        </header>
        <div className="border-b border-line px-5 py-3">
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Търси по заглавие или резюме"
            className="np-input"
          />
          <p className="mt-2 text-xs text-muted">
            {loading && results.length === 0
              ? "Търсене..."
              : `Избрани: ${selected.size} · показани ${results.length}${hasMore ? "+" : ""}`}
          </p>
          {error ? <p className="mt-1 text-xs text-danger">{error}</p> : null}
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-3">
          {selectedArticles.length > 0 ? (
            <section className="mb-4">
              <h3 className="mb-2 text-xs font-bold tracking-wide text-muted uppercase">Избрани</h3>
              <ol className="flex flex-col gap-1">
                {selectedArticles.map((article) => (
                  <ArticleRow key={`sel-${article.id}`} article={article} checked onToggle={() => toggle(article)} />
                ))}
              </ol>
            </section>
          ) : null}
          <ol className="flex flex-col gap-1">
            {results.length === 0 && !loading ? (
              <li className="text-sm text-muted">Няма намерени статии.</li>
            ) : null}
            {results
              .filter((article) => !selected.has(article.id))
              .map((article) => (
                <ArticleRow
                  key={article.id}
                  article={article}
                  checked={selected.has(article.id)}
                  onToggle={() => toggle(article)}
                />
              ))}
          </ol>
          {hasMore ? (
            <button
              type="button"
              onClick={() => void loadPage(search, results.length, true)}
              disabled={loading}
              className="np-btn np-btn-secondary mt-3 w-full"
            >
              {loading ? "Зареждане..." : "Зареди още"}
            </button>
          ) : null}
        </div>
        <footer className="flex items-center justify-end gap-2 border-t border-line px-5 py-3">
          <button type="button" onClick={onClose} className="np-btn np-btn-secondary">
            Отказ
          </button>
          <button type="button" onClick={onConfirmClick} className="np-btn np-btn-primary">
            Готово ({selected.size})
          </button>
        </footer>
      </div>
    </div>
  );
}

function ArticleRow({
  article,
  checked,
  onToggle,
}: {
  article: Selection;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <li>
      <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-line bg-surface px-3 py-2 transition hover:border-accent/40">
        <input type="checkbox" checked={checked} onChange={onToggle} className="size-4" />
        {article.heroUrl ? (
          <img src={browserMediaSrc(article.heroUrl)} alt="" className="size-12 rounded-md object-cover" />
        ) : (
          <span className="size-12 rounded-md bg-surface-2" />
        )}
        <div className="min-w-0 flex-1">
          <div className="line-clamp-2 text-sm font-bold text-ink">{article.title}</div>
          <div className="text-xs text-muted">
            {article.categoryName ? `${article.categoryName} · ` : ""}
            {formatDate(article.publishedAt)}
          </div>
        </div>
      </label>
    </li>
  );
}
