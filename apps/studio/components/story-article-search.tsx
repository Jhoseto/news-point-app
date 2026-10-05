"use client";

import { useEffect, useMemo, useState } from "react";
import { withBase } from "@/lib/paths";
import type { StoryThemeArticleSearchResult } from "@/lib/story-theme-types";

type Selection = StoryThemeArticleSearchResult;

type Props = {
  open: boolean;
  initial: Selection[];
  onClose: () => void;
  onConfirm: (next: Selection[]) => void;
};

function formatDate(value: Date | string | null) {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("bg-BG", { day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
}

export function StoryArticleSearch({ open, initial, onClose, onConfirm }: Props) {
  const initialIds = useMemo(() => new Set(initial.map((a) => a.id)), [initial]);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<Selection[]>([]);
  const [selected, setSelected] = useState<Set<string>>(initialIds);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setSelected(new Set(initialIds));
  }, [open, initialIds]);

  useEffect(() => {
    if (!open) return;
    const handle = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const url = withBase(`/api/stories/search-articles?q=${encodeURIComponent(search)}&limit=20`);
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) throw new Error(`Грешка ${res.status}`);
        const data = (await res.json()) as { articles: Selection[] };
        setResults(data.articles);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Грешка при търсене.");
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(handle);
  }, [search, open]);

  if (!open) return null;

  const toggle = (id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const onConfirmClick = () => {
    const all = new Map<string, Selection>();
    for (const a of initial) all.set(a.id, a);
    for (const r of results) all.set(r.id, r);
    const ordered: Selection[] = [];
    for (const id of selected) {
      const found = all.get(id);
      if (found) ordered.push(found);
    }
    onConfirm(ordered);
  };

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
            {loading ? "Търсене..." : `Избрани: ${selected.size}`}
          </p>
          {error ? <p className="mt-1 text-xs text-danger">{error}</p> : null}
        </div>
        <ol className="flex-1 overflow-y-auto px-5 py-3">
          {results.length === 0 && !loading ? (
            <li className="text-sm text-muted">Няма намерени статии.</li>
          ) : null}
          {results.map((article) => {
            const isSelected = selected.has(article.id);
            return (
              <li key={article.id}>
                <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-line bg-surface px-3 py-2 transition hover:border-accent/40">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggle(article.id)}
                    className="size-4"
                  />
                  {article.heroUrl ? (
                    <img src={article.heroUrl} alt="" className="size-12 rounded-md object-cover" />
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
          })}
        </ol>
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
