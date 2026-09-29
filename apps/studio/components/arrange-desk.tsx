"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  HOME_PAGE_KEY,
  activePlacement,
  categorySlotCatalog,
  duplicateArticleIds,
  homeSlotCatalog,
  type ArrangementDocument,
  type ArrangementItem,
  type SlotLabel,
} from "@newspoint/content";
import type { ArrangementArticle, ArrangementHistoryItem, MenuCategory } from "@/lib/arrangement-types";
import { withBase } from "@/lib/paths";

const field = "h-8 w-full rounded-md border border-line bg-surface px-2 text-xs text-ink outline-none focus:border-accent";

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function fromLocalInput(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function remaining(endsAt: string | null, now: number): string {
  if (!endsAt) return "Постоянно";
  const minutes = Math.ceil((Date.parse(endsAt) - now) / 60000);
  if (minutes <= 0) return "Срокът изтече";
  if (minutes < 60) return `Още ${minutes} мин`;
  return `Още ${Math.floor(minutes / 60)} ч ${minutes % 60} мин`;
}

export function ArrangeDesk({
  pageKey,
  menu,
  draft,
  note,
  articles,
  history,
  ready,
}: {
  pageKey: string;
  menu: MenuCategory[];
  draft: ArrangementDocument;
  note: string;
  articles: Record<string, ArrangementArticle>;
  history: ArrangementHistoryItem[];
  ready: boolean;
}) {
  const router = useRouter();
  const catalog = pageKey === HOME_PAGE_KEY ? homeSlotCatalog(menu) : categorySlotCatalog();
  const [document, setDocument] = useState(draft);
  const [deskNote, setDeskNote] = useState(note);
  const [known, setKnown] = useState(articles);
  const [selected, setSelected] = useState(catalog[0]?.key ?? "hero");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ArrangementArticle[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const visible = useMemo(() => new Set(Object.values(known).filter((article) => article.isPublic).map((article) => article.id)), [known]);
  const duplicates = duplicateArticleIds(document, now, visible);
  const groups = catalog.reduce<Record<string, SlotLabel[]>>((all, slot) => {
    const list = all[slot.group] ?? [];
    list.push(slot);
    all[slot.group] = list;
    return all;
  }, {});

  async function send(body: unknown) {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(withBase("/api/arrangements/"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json() as { error?: { message?: string } };
      if (!response.ok) {
        setMessage(data.error?.message ?? "Неуспешен запис.");
        return false;
      }
      return true;
    } catch {
      setMessage("Няма връзка.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  function slotItems(key: string): ArrangementItem[] {
    return document.slots[key]?.items ?? [];
  }

  function writeSlot(key: string, items: ArrangementItem[]) {
    setDocument((current) => {
      const slots = { ...current.slots };
      if (items.length) slots[key] = { items };
      else delete slots[key];
      return { ...current, slots };
    });
    setNow(Date.now());
  }

  function choose(article: ArrangementArticle, queue: boolean) {
    setKnown((current) => ({ ...current, [article.id]: article }));
    const items = slotItems(selected).filter((item) => item.articleId !== article.id);
    const blank: ArrangementItem = { articleId: article.id, startsAt: null, endsAt: null, placedBy: "", placedAt: null };
    writeSlot(selected, queue ? [...items, blank].slice(0, 6) : [blank, ...items.slice(0, 5)]);
    setResults([]);
    setQuery("");
  }

  async function search(event: FormEvent) {
    event.preventDefault();
    const response = await fetch(withBase(`/api/arrangements/search/?q=${encodeURIComponent(query)}`), { cache: "no-store" });
    const data = await response.json() as { articles?: ArrangementArticle[] };
    setResults(data.articles ?? []);
  }

  const current = slotItems(selected)[0];
  const active = activePlacement(document.slots[selected], now, visible);

  if (!ready) {
    return <p className="np-card p-4 text-sm text-muted">Екранът е готов. Приложете миграция 20_page_arrangements.sql и презаредете.</p>;
  }

  return (
    <div className="grid items-start gap-3 xl:grid-cols-[minmax(0,1.4fr)_minmax(18rem,0.8fr)]">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-1">
          <a href={withBase("/arrange/?page=home")} className={`rounded-full px-2.5 py-1 text-xs font-bold ${pageKey === HOME_PAGE_KEY ? "bg-ink text-white" : "bg-surface-2 text-muted"}`}>Начало</a>
          {menu.map((category) => (
            <a key={category.id} href={withBase(`/arrange/?page=${category.id}`)} className={`rounded-full px-2.5 py-1 text-xs font-semibold ${pageKey === category.id ? "bg-ink text-white" : "bg-surface-2 text-muted"}`}>{category.name}</a>
          ))}
        </div>

        <form onSubmit={search} className="np-card flex flex-col gap-2 p-3">
          <p className="text-xs text-muted">Избрано място: <strong className="text-ink">{catalog.find((slot) => slot.key === selected)?.label}</strong>. Търсенето слага новина там. Решетката не се променя.</p>
          <div className="flex gap-1.5">
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Заглавие на публикувана новина" className={field} />
            <button type="submit" className="np-btn np-btn-secondary h-8 shrink-0 px-2 text-xs">Търси</button>
          </div>
          {results.length ? (
            <ul className="divide-y divide-line">
              {results.map((article) => (
                <li key={article.id} className="flex items-center gap-2 py-1.5">
                  <span className="min-w-0 flex-1 truncate text-xs text-ink">{article.title}</span>
                  <button type="button" className="np-btn np-btn-primary h-7 px-2 text-[11px]" onClick={() => choose(article, false)}>На мястото</button>
                  <button type="button" className="np-btn np-btn-secondary h-7 px-2 text-[11px]" onClick={() => choose(article, true)}>В опашката</button>
                </li>
              ))}
            </ul>
          ) : null}
        </form>

        {current ? (
          <div className="np-card grid gap-2 p-3 sm:grid-cols-2">
            <label className="flex items-center gap-2 text-xs font-semibold text-ink">
              <input
                type="checkbox"
                checked={current.endsAt === null}
                onChange={(event) => {
                  const items = [...slotItems(selected)];
                  items[0] = { ...current, endsAt: event.target.checked ? null : new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString() };
                  writeSlot(selected, items);
                }}
              />
              Постоянно
            </label>
            <p className="text-xs text-muted">{remaining(active?.endsAt ?? current.endsAt, now)}{current.placedBy ? ` · ${current.placedBy}` : ""}</p>
            <label className="text-[11px] text-muted">От
              <input type="datetime-local" value={toLocalInput(current.startsAt)} className={field} onChange={(event) => {
                const items = [...slotItems(selected)];
                items[0] = { ...current, startsAt: fromLocalInput(event.target.value) };
                writeSlot(selected, items);
              }} />
            </label>
            <label className="text-[11px] text-muted">До
              <input type="datetime-local" disabled={current.endsAt === null} value={toLocalInput(current.endsAt)} className={field} onChange={(event) => {
                const items = [...slotItems(selected)];
                items[0] = { ...current, endsAt: fromLocalInput(event.target.value) };
                writeSlot(selected, items);
              }} />
            </label>
            {slotItems(selected).slice(1).length ? (
              <ul className="sm:col-span-2 text-xs text-muted">
                {slotItems(selected).slice(1).map((item, index) => (
                  <li key={`${item.articleId}-${index}`} className="flex items-center justify-between gap-2 py-0.5">
                    <span className="truncate">Опашка: {known[item.articleId]?.title ?? "Новина"}</span>
                    <button type="button" className="font-semibold text-link" onClick={() => writeSlot(selected, slotItems(selected).filter((_, itemIndex) => itemIndex !== index + 1))}>Махни</button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        {Object.entries(groups).map(([group, slots]) => (
          <section key={group} className="np-card overflow-hidden">
            <h2 className="border-b border-line bg-surface-2/60 px-3 py-1.5 text-[11px] font-bold tracking-wide text-faint uppercase">{group}</h2>
            <ul className="divide-y divide-line">
              {slots.map((slot) => {
                const item = activePlacement(document.slots[slot.key], now, visible);
                const title = item ? known[item.articleId]?.title : null;
                return (
                  <li key={slot.key}>
                    <button type="button" onClick={() => { setSelected(slot.key); setNow(Date.now()); }} className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs ${selected === slot.key ? "bg-accent/10" : "hover:bg-surface-2/60"}`}>
                      <span className="w-36 shrink-0 font-semibold text-muted">{slot.label}</span>
                      <span className="min-w-0 flex-1 truncate text-ink">{title ?? "Автоматично"}</span>
                      <span className="shrink-0 text-[11px] text-faint">{item ? remaining(item.endsAt, now) : ""}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>

      <aside className="flex flex-col gap-3 xl:sticky xl:top-3">
        <section className="np-card p-3">
          <h2 className="text-sm font-bold text-ink">Преглед</h2>
          <p className="mt-1 text-[11px] text-muted">Показва само коя новина къде стои. Не пипа сайта, докато не публикувате.</p>
          {duplicates.length ? <p className="mt-2 text-xs font-semibold text-warning">Една и съща новина е на повече от едно място.</p> : null}
          <ul className="mt-2 max-h-80 space-y-1 overflow-y-auto text-xs">
            {catalog.map((slot) => {
              const item = activePlacement(document.slots[slot.key], now, visible);
              return <li key={slot.key} className="flex gap-2"><span className="w-28 shrink-0 text-muted">{slot.label}</span><span className="min-w-0 truncate">{item ? known[item.articleId]?.title ?? "Новина" : "Автоматично"}</span></li>;
            })}
          </ul>
        </section>
        <label className="text-[11px] text-muted">Бележка към смяната
          <textarea value={deskNote} onChange={(event) => setDeskNote(event.target.value)} maxLength={400} rows={3} className="mt-1 w-full rounded-md border border-line bg-surface px-2 py-1 text-xs text-ink outline-none focus:border-accent" />
        </label>
        <div className="flex gap-1.5">
          <button type="button" disabled={busy} className="np-btn np-btn-secondary h-8 flex-1 text-xs" onClick={async () => { if (await send({ action: "save", pageKey, note: deskNote, document })) setMessage("Черновата е запазена."); }}>Запази</button>
          <button type="button" disabled={busy} className="np-btn np-btn-primary h-8 flex-1 text-xs" onClick={async () => {
            if (!await send({ action: "save", pageKey, note: deskNote, document })) return;
            if (await send({ action: "publish", pageKey })) setMessage("Подреждането е на сайта.");
          }}>Публикувай подреждането</button>
        </div>
        {message ? <p className="text-xs font-semibold text-ink">{message}</p> : null}
        <section className="np-card p-3">
          <h2 className="text-sm font-bold text-ink">Предишни</h2>
          {history.length === 0 ? <p className="mt-1 text-xs text-muted">Още няма публикувано подреждане.</p> : (
            <ul className="mt-2 space-y-1">
              {history.map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-2 text-xs">
                  <span className="text-muted">{item.publishedAt ? new Date(item.publishedAt).toLocaleString("bg-BG") : "Без час"}</span>
                  <button type="button" className="font-bold text-link" disabled={busy} onClick={async () => { if (await send({ action: "revert", pageKey, historyId: item.id })) router.refresh(); }}>Върни</button>
                </li>
              ))}
            </ul>
          )}
        </section>
        <ExcludeBox document={document} known={known} onChange={setDocument} onKnow={(article) => setKnown((current) => ({ ...current, [article.id]: article }))} />
      </aside>
    </div>
  );
}

function ExcludeBox({
  document,
  known,
  onChange,
  onKnow,
}: {
  document: ArrangementDocument;
  known: Record<string, ArrangementArticle>;
  onChange: (next: ArrangementDocument) => void;
  onKnow: (article: ArrangementArticle) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ArrangementArticle[]>([]);
  return (
    <section className="np-card p-3">
      <h2 className="text-sm font-bold text-ink">Без автоматично място</h2>
      <p className="mt-1 text-[11px] text-muted">Новината остава публикувана. Празните места я прескачат.</p>
      <form className="mt-2 flex gap-1.5" onSubmit={async (event) => {
        event.preventDefault();
        const response = await fetch(withBase(`/api/arrangements/search/?q=${encodeURIComponent(query)}`), { cache: "no-store" });
        const data = await response.json() as { articles?: ArrangementArticle[] };
        setResults(data.articles ?? []);
      }}>
        <input value={query} onChange={(event) => setQuery(event.target.value)} className={field} placeholder="Заглавие" />
        <button className="np-btn np-btn-secondary h-8 px-2 text-xs" type="submit">Търси</button>
      </form>
      <ul className="mt-2 space-y-1 text-xs">
        {results.map((article) => (
          <li key={article.id}>
            <button type="button" className="font-semibold text-link" onClick={() => {
              onKnow(article);
              if (!document.excluded.includes(article.id)) onChange({ ...document, excluded: [...document.excluded, article.id] });
              setResults([]);
            }}>{article.title}</button>
          </li>
        ))}
        {document.excluded.map((id) => (
          <li key={id} className="flex items-center justify-between gap-2">
            <span className="truncate">{known[id]?.title ?? "Новина"}</span>
            <button type="button" className="font-semibold text-link" onClick={() => onChange({ ...document, excluded: document.excluded.filter((item) => item !== id) })}>Махни</button>
          </li>
        ))}
      </ul>
    </section>
  );
}
