"use client";

import { useEffect, useState } from "react";
import { HOME_PAGE_KEY, categorySlotCatalog, homeSlotCatalog, type SlotLabel } from "@newspoint/content";
import type { MenuCategory } from "@/lib/arrangement-types";
import { withBase } from "@/lib/paths";

export function PlaceArticle({ articleId, publicArticle, menu }: { articleId: string; publicArticle: boolean; menu: MenuCategory[] }) {
  const [open, setOpen] = useState(false);
  const [pageKey, setPageKey] = useState(HOME_PAGE_KEY);
  const [hours, setHours] = useState<number | null>(2);
  const [message, setMessage] = useState("");
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState<"place" | "draft" | null>(null);
  const slots: SlotLabel[] = pageKey === HOME_PAGE_KEY ? homeSlotCatalog(menu) : categorySlotCatalog();
  const [version, setVersion] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setVersion(null);
    void fetch(withBase(`/api/arrangements/?page=${encodeURIComponent(pageKey)}`), { cache: "no-store", signal: controller.signal })
      .then(async response => {
        const data = await response.json();
        if (!response.ok || !data.version) throw new Error(data.error?.message ?? "Неуспешно зареждане.");
        if (!controller.signal.aborted) setVersion(data.version);
      }).catch(error => { if (!controller.signal.aborted) setMessage(error instanceof Error ? error.message : "Няма връзка."); });
    return () => controller.abort();
  }, [open, pageKey]);
  const [slot, setSlot] = useState(slots[0]?.key ?? "hero");

  if (!publicArticle) return null;

  async function submit(publish: boolean) {
    if (!version) return;
    setBusy(publish ? "place" : "draft");
    setMessage("");
    setOk(false);
    try {
      const response = await fetch(withBase("/api/arrangements/"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "place", pageKey, slot, articleId, hours, publish, expectedVersion: version }),
      });
      const data = await response.json() as { error?: { message?: string }; published?: boolean; version?: string; path?: string };
      if (!response.ok) {
        setMessage(data.error?.message ?? "Неуспешен запис.");
        return;
      }
      setVersion(data.version ?? null);
      setOk(true);
      if (publish) {
        setMessage("Сложено е на сайта. Читателите го виждат веднага.");
      } else {
        setMessage("Записано е в черновата. Публикувайте от Уеб управление, за да се види на сайта.");
      }
    } catch {
      setMessage("Няма връзка.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <button data-help="Поставя тази публикувана новина на избрано място в началната страница или рубрика." type="button" className="np-btn np-btn-secondary inline-flex h-7 items-center px-2 py-0 text-[11px]" onClick={() => { setOpen(true); setMessage(""); setOk(false); }}>На място</button>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" onClick={() => !busy && setOpen(false)}>
          <div className="np-card w-full max-w-md p-4 text-left" role="dialog" aria-labelledby="place-title" onClick={(event) => event.stopPropagation()}>
            <h2 id="place-title" className="text-sm font-bold text-ink">На място</h2>
            <label className="mt-3 block text-[11px] text-muted">Страница
              <select data-help="Страницата, на която искате да закрепите новината." disabled={!!busy} className="mt-1 h-8 w-full rounded-md border border-line bg-surface px-2 text-xs" value={pageKey} onChange={(event) => {
                const next = event.target.value;
                setVersion(null);
                setMessage("");
                setOk(false);
                setPageKey(next);
                const nextSlots = next === HOME_PAGE_KEY ? homeSlotCatalog(menu) : categorySlotCatalog();
                setSlot(nextSlots[0]?.key ?? "lead");
              }}>
                <option value={HOME_PAGE_KEY}>Начало</option>
                {menu.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
              </select>
            </label>
            <label className="mt-2 block text-[11px] text-muted">Място
              <select data-help="Конкретното място в избраната страница." disabled={!!busy} className="mt-1 h-8 w-full rounded-md border border-line bg-surface px-2 text-xs" value={slot} onChange={(event) => setSlot(event.target.value)}>
                {slots.map((item) => <option key={item.key} value={item.key}>{item.group}: {item.label}</option>)}
              </select>
            </label>
            <label className="mt-2 block text-[11px] text-muted">Срок
              <select data-help="Колко време новината да е закрепена. Постоянно означава без краен срок." disabled={!!busy} className="mt-1 h-8 w-full rounded-md border border-line bg-surface px-2 text-xs" value={hours === null ? "permanent" : String(hours)} onChange={(event) => setHours(event.target.value === "permanent" ? null : Number(event.target.value))}>
                <option value="2">2 часа</option>
                <option value="6">6 часа</option>
                <option value="12">12 часа</option>
                <option value="24">24 часа</option>
                <option value="permanent">Постоянно</option>
              </select>
            </label>
            {message ? (
              <p role={ok ? "status" : "alert"} className={`mt-2 text-xs font-semibold ${ok ? "text-success" : "text-danger"}`}>
                {message}
              </p>
            ) : null}
            <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
              <button type="button" disabled={!!busy} className="np-btn np-btn-secondary h-8 px-3 text-xs" onClick={() => setOpen(false)}>Затвори</button>
              <button data-help="Записва мястото само в черновата на подреждането. Читателите още не виждат промяната." type="button" disabled={!!busy || !version} className="np-btn np-btn-secondary h-8 px-3 text-xs" onClick={() => void submit(false)}>
                {busy === "draft" ? "Запис…" : "Чернова"}
              </button>
              <button data-help="Закрепя новината на избраното място и веднага публикува промяната." type="button" disabled={!!busy || !version} className="np-btn np-btn-primary h-8 px-3 text-xs" onClick={() => void submit(true)}>
                {busy === "place" ? "Слагане…" : "Сложи"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
