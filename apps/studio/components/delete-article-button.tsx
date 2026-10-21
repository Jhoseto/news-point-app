"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { withBase } from "@/lib/paths";

export function DeleteArticleButton({ id, title }: { id: string; title: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const label = title.trim() || "Без заглавие";

  async function confirmDelete() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(withBase(`/api/editor/articles/${id}/delete/`), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirm: true }),
      });
      const payload = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
      if (!response.ok) {
        throw new Error(payload?.error?.message ?? "Изтриването не успя.");
      }
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Изтриването не успя.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button data-help="Изтрива материала след потвърждение. Проверете внимателно коя новина сте избрали."
        type="button"
        onClick={() => { setError(null); setOpen(true); }}
        className="np-btn np-btn-secondary inline-flex h-7 items-center px-2 py-0 text-[11px] text-danger"
      >
        Изтрий
      </button>
      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-article-title"
          aria-describedby="delete-article-desc"
          onClick={() => { if (!busy) setOpen(false); }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
        >
          <div onClick={(event) => event.stopPropagation()} className="np-card flex max-w-md flex-col gap-4 p-5">
            <div className="flex flex-col gap-2">
              <h2 id="delete-article-title" className="text-base font-bold text-ink">
                Изтриване на материал
              </h2>
              <p id="delete-article-desc" className="text-sm text-body">
                Сигурни ли сте, че искате да изтриете „{label}"? Това е <strong className="font-bold text-ink">необратимо</strong>: статията
                изчезва от сайта, архивите, подрежданията и темите с продължение. Възстановяване няма.
              </p>
            </div>
            {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
            <div className="flex justify-end gap-2">
              <button data-help="Затваря потвърждението. Материалът остава непроменен." type="button" disabled={busy} onClick={() => setOpen(false)} className="np-btn np-btn-secondary">
                Отказ
              </button>
              <button data-help="Изтрива материала окончателно от сайта и подрежданията. Възстановяване няма." type="button" disabled={busy} onClick={() => void confirmDelete()} className="np-btn bg-danger text-on-accent">
                {busy ? "Изтриване…" : "Изтрий окончателно"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
