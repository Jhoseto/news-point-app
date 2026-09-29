"use client";

import { useEffect, useState } from "react";
import type { Block } from "@newspoint/content";
import { ArticlePreview, type PreviewArticle } from "@/components/article-preview";
import { withBase } from "@/lib/paths";

export function ArticleDeskPreview({ id, title }: { id: string; title: string }) {
  const [open, setOpen] = useState(false);
  const [article, setArticle] = useState<PreviewArticle | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setArticle(null);
    setError(null);
    void fetch(withBase(`/api/editor/articles/${id}/preview/`), { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("preview failed");
        return response.json() as Promise<PreviewArticle & { body: Block[] }>;
      })
      .then((data) => {
        if (!cancelled) setArticle({ ...data, blocks: data.body });
      })
      .catch(() => {
        if (!cancelled) setError("Прегледът не се зареди.");
      });
    return () => { cancelled = true; };
  }, [id, open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open]);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="block w-full truncate text-left font-semibold text-ink group-hover:text-accent">
        {title}
      </button>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-ink/45 p-3 sm:p-6" onClick={() => setOpen(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className="flex max-h-[92dvh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-page shadow-card"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center gap-2 border-b border-line bg-surface px-3 py-2">
              <p className="min-w-0 flex-1 truncate text-sm font-bold text-ink">Преглед</p>
              <a href={withBase(`/articles/${id}/`)} className="np-btn np-btn-secondary h-7 px-2 py-0 text-[11px]">Редакция</a>
              <button type="button" onClick={() => setOpen(false)} className="np-btn np-btn-secondary h-7 px-2 py-0 text-[11px]">Затвори</button>
            </div>
            <div className="min-h-0 flex-1 overflow-auto">
              {error ? <p className="px-6 py-10 text-sm text-muted">{error}</p> : null}
              {!error && !article ? <p className="px-6 py-10 text-sm text-muted">Зареждане…</p> : null}
              {article ? <ArticlePreview article={article} theme="light" /> : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
