"use client";

import { useState } from "react";
import { HOME_PAGE_KEY, categorySlotCatalog, homeSlotCatalog, type SlotLabel } from "@newspoint/content";
import type { MenuCategory } from "@/lib/arrangement-types";
import { withBase } from "@/lib/paths";

export function PlaceArticle({ articleId, publicArticle, menu }: { articleId: string; publicArticle: boolean; menu: MenuCategory[] }) {
  const [open, setOpen] = useState(false);
  const [pageKey, setPageKey] = useState(HOME_PAGE_KEY);
  const [hours, setHours] = useState<number | null>(2);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const slots: SlotLabel[] = pageKey === HOME_PAGE_KEY ? homeSlotCatalog(menu) : categorySlotCatalog();
  const [slot, setSlot] = useState(slots[0]?.key ?? "hero");

  if (!publicArticle) return null;

  async function place() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(withBase("/api/arrangements/"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "place", pageKey, slot, articleId, hours }),
      });
      const data = await response.json() as { error?: { message?: string } };
      setMessage(response.ok ? "Записано е в черновата. Публикувайте от Подреждане." : data.error?.message ?? "Неуспешен запис.");
    } catch {
      setMessage("Няма връзка.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" className="np-btn np-btn-secondary inline-flex h-7 items-center px-2 py-0 text-[11px]" onClick={() => setOpen(true)}>На място</button>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" onClick={() => setOpen(false)}>
          <div className="np-card w-full max-w-md p-4 text-left" role="dialog" aria-labelledby="place-title" onClick={(event) => event.stopPropagation()}>
            <h2 id="place-title" className="text-sm font-bold text-ink">На място</h2>
            <label className="mt-3 block text-[11px] text-muted">Страница
              <select className="mt-1 h-8 w-full rounded-md border border-line bg-surface px-2 text-xs" value={pageKey} onChange={(event) => {
                const next = event.target.value;
                setPageKey(next);
                const nextSlots = next === HOME_PAGE_KEY ? homeSlotCatalog(menu) : categorySlotCatalog();
                setSlot(nextSlots[0]?.key ?? "lead");
              }}>
                <option value={HOME_PAGE_KEY}>Начало</option>
                {menu.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
              </select>
            </label>
            <label className="mt-2 block text-[11px] text-muted">Място
              <select className="mt-1 h-8 w-full rounded-md border border-line bg-surface px-2 text-xs" value={slot} onChange={(event) => setSlot(event.target.value)}>
                {slots.map((item) => <option key={item.key} value={item.key}>{item.group}: {item.label}</option>)}
              </select>
            </label>
            <label className="mt-2 block text-[11px] text-muted">Срок
              <select className="mt-1 h-8 w-full rounded-md border border-line bg-surface px-2 text-xs" value={hours === null ? "permanent" : String(hours)} onChange={(event) => setHours(event.target.value === "permanent" ? null : Number(event.target.value))}>
                <option value="2">2 часа</option>
                <option value="6">6 часа</option>
                <option value="12">12 часа</option>
                <option value="24">24 часа</option>
                <option value="permanent">Постоянно</option>
              </select>
            </label>
            {message ? <p className="mt-2 text-xs font-semibold text-ink">{message}</p> : null}
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" className="np-btn np-btn-secondary h-8 px-3 text-xs" onClick={() => setOpen(false)}>Затвори</button>
              <button type="button" disabled={busy} className="np-btn np-btn-primary h-8 px-3 text-xs" onClick={() => void place()}>Запиши в черновата</button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
