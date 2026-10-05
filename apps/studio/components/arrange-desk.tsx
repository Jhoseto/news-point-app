"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  ARRANGEMENT_QUEUE_LIMIT,
  CATEGORY_NEXT_COUNT,
  HOME_CAROUSEL_COUNT,
  HOME_FOCUS_CAROUSEL_PREFIX,
  HOME_LATEST_PIN_COUNT,
  HOME_PAGE_KEY,
  HOME_TOP_THEMES_CAROUSEL_PREFIX,
  HOME_VOICE_CAROUSEL_PREFIX,
  activePlacement,
  homeCarouselSlotKey,
  homeCarouselSlotPrefix,
  type HomeCarouselSlotPrefix,
  categorySlotCatalog,
  duplicateArticleIds,
  homeSlotCatalog,
  planHomeSections,
  sectionSlotKey,
  type ArrangementDocument,
  type ArrangementItem,
  type HomeSectionPlan,
} from "@newspoint/content";
import type { ArrangementArticle, ArrangementHistoryItem, MenuCategory } from "@/lib/arrangement-types";
import { withBase } from "@/lib/paths";

const field = "h-8 w-full min-w-0 max-w-full rounded-md border border-white/15 bg-white/10 px-2 text-xs text-white outline-none placeholder:text-white/40 focus:border-white/40";

const ACCENTS: Record<string, string> = {
  plovdiv: "#1396a3",
  "regionalni-novini": "#26936e",
  balgariya: "#5142d5",
  politika: "#7650c8",
  "kriminalni-novini": "#d57546",
  "ot-soczialnite-mrezhi": "#b75f9c",
  "svetovni-novini": "#3b78d1",
  "sportni-novini": "#289b65",
  tehnologii: "#2794b4",
  "biznes-novini": "#b58533",
  zdrave: "#299c82",
  kultura: "#a365c1",
  lajfstajl: "#ca6999",
  izbori: "#7566d6",
  "glasat-na-istinata": "#3818d6",
};

function accent(slug?: string) {
  return (slug && ACCENTS[slug]) || "#5b6cff";
}

const CAROUSEL_ROW_TITLES: Record<HomeCarouselSlotPrefix, string> = {
  [HOME_FOCUS_CAROUSEL_PREFIX]: "На Фокус",
  [HOME_TOP_THEMES_CAROUSEL_PREFIX]: "Топ теми",
  [HOME_VOICE_CAROUSEL_PREFIX]: "Гласът на истината",
};

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

/** Current local minute as ISO — for „От сега“ in the slot editor. */
function nowIsoForSlot(): string {
  const date = new Date();
  date.setSeconds(0, 0);
  return date.toISOString();
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
  const [document, setDocument] = useState(draft);
  const [deskNote, setDeskNote] = useState(note);
  const [known, setKnown] = useState(articles);
  const [selected, setSelected] = useState<string | null>(null);
  const [editItems, setEditItems] = useState<ArrangementItem[]>([]);
  const [inspectorError, setInspectorError] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ArrangementArticle[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const visible = useMemo(() => new Set(Object.values(known).filter((article) => article.isPublic).map((article) => article.id)), [known]);
  const duplicates = duplicateArticleIds(document, now, visible);
  const planned = planHomeSections(menu);
  const category = menu.find((item) => item.id === pageKey);

  async function postArrangement(body: unknown): Promise<{ ok: true } | { ok: false; message: string }> {
    try {
      const response = await fetch(withBase("/api/arrangements/"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json() as { error?: { message?: string } };
      if (!response.ok) return { ok: false, message: data.error?.message ?? "Неуспешен запис." };
      return { ok: true };
    } catch {
      return { ok: false, message: "Няма връзка." };
    }
  }

  async function send(body: unknown) {
    setBusy(true);
    setMessage("");
    try {
      const result = await postArrangement(body);
      if (!result.ok) {
        setMessage(result.message);
        return false;
      }
      return true;
    } finally {
      setBusy(false);
    }
  }

  /** Writes the draft and publishes so the public site matches the desk. */
  async function persistAndPublish(nextDocument: ArrangementDocument): Promise<string | null> {
    setBusy(true);
    setInspectorError("");
    try {
      const saved = await postArrangement({ action: "save", pageKey, note: deskNote, document: nextDocument });
      if (!saved.ok) return saved.message;
      const published = await postArrangement({ action: "publish", pageKey });
      if (!published.ok) return `Черновата е записана, но сайтът не се обнови: ${published.message}`;
      return null;
    } finally {
      setBusy(false);
    }
  }

  function slotItems(key: string): ArrangementItem[] {
    return document.slots[key]?.items ?? [];
  }

  function documentWithSlot(base: ArrangementDocument, key: string, items: ArrangementItem[]): ArrangementDocument {
    const slots = { ...base.slots };
    if (items.length) slots[key] = { items };
    else delete slots[key];
    return { ...base, slots };
  }

  function writeSlot(key: string, items: ArrangementItem[]) {
    setDocument((current) => documentWithSlot(current, key, items));
    setNow(Date.now());
  }

  function newPlacementItem(articleId: string): ArrangementItem {
    return { articleId, startsAt: null, endsAt: null, placedBy: "", placedAt: null };
  }

  function pickArticle(article: ArrangementArticle, queue: boolean) {
    if (!selected) return;
    setKnown((current) => ({ ...current, [article.id]: article }));
    setInspectorError("");
    const blank = newPlacementItem(article.id);
    setEditItems((items) => {
      const rest = items.filter((item) => item.articleId !== article.id);
      if (queue) return [...rest, blank].slice(0, 1 + ARRANGEMENT_QUEUE_LIMIT);
      return [blank, ...rest].slice(0, 1 + ARRANGEMENT_QUEUE_LIMIT);
    });
    setResults([]);
    setQuery("");
  }

  function updateEditItem(index: number, patch: Partial<ArrangementItem>) {
    setEditItems((items) => {
      if (!items[index]) return items;
      const next = [...items];
      next[index] = { ...next[index]!, ...patch };
      return next;
    });
    setInspectorError("");
  }

  async function saveInspector() {
    if (!selected || busy) return;
    for (const item of editItems) {
      if (item.startsAt && item.endsAt && Date.parse(item.startsAt) >= Date.parse(item.endsAt)) {
        setInspectorError("Крайният час трябва да е след началния.");
        return;
      }
    }
    const nextDocument = documentWithSlot(document, selected, editItems);
    setDocument(nextDocument);
    setNow(Date.now());
    const error = await persistAndPublish(nextDocument);
    if (error) {
      setInspectorError(error);
      setMessage(error);
      return;
    }
    setMessage("Запазено и на сайта.");
    closeInspector();
    router.refresh();
  }

  function openSlot(key: string) {
    setSelected(key);
    setEditItems([...(document.slots[key]?.items ?? [])]);
    setInspectorError("");
    setQuery("");
    setResults([]);
    setNow(Date.now());
  }

  function closeInspector() {
    setSelected(null);
    setEditItems([]);
    setInspectorError("");
    setQuery("");
    setResults([]);
  }

  function swapSlotKeys(keyA: string, keyB: string) {
    setDocument((current) => {
      const slots = { ...current.slots };
      const itemsA = slots[keyA]?.items ?? [];
      const itemsB = slots[keyB]?.items ?? [];
      if (!itemsA.length && !itemsB.length) return current;
      if (itemsB.length) slots[keyA] = { items: itemsB };
      else delete slots[keyA];
      if (itemsA.length) slots[keyB] = { items: itemsA };
      else delete slots[keyB];
      return { ...current, slots };
    });
    setNow(Date.now());
  }

  function moveCarouselSlot(prefix: HomeCarouselSlotPrefix, index: number, delta: number) {
    const next = index + delta;
    if (next < 0 || next >= HOME_CAROUSEL_COUNT) return;
    swapSlotKeys(homeCarouselSlotKey(prefix, index), homeCarouselSlotKey(prefix, next));
  }

  function moveQueueItemInDraft(queueIndex: number, delta: number) {
    setEditItems((items) => {
      const from = queueIndex + 1;
      const to = from + delta;
      if (from < 1 || to < 1 || from >= items.length || to >= items.length) return items;
      const next = [...items];
      [next[from], next[to]] = [next[to]!, next[from]!];
      return next;
    });
  }

  const slotCatalog = useMemo(
    () => new Map((pageKey === HOME_PAGE_KEY ? homeSlotCatalog(menu) : categorySlotCatalog()).map((entry) => [entry.key, entry])),
    [menu, pageKey],
  );

  function slotHeading(key: string) {
    const entry = slotCatalog.get(key);
    return entry ? `${entry.group} · ${entry.label}` : key;
  }

  async function search(event: FormEvent) {
    event.preventDefault();
    const response = await fetch(withBase(`/api/arrangements/search/?q=${encodeURIComponent(query)}`), { cache: "no-store" });
    const data = await response.json() as { articles?: ArrangementArticle[] };
    setResults(data.articles ?? []);
  }

  function titleFor(key: string) {
    const item = activePlacement(document.slots[key], now, visible);
    return item ? known[item.articleId]?.title ?? "Новина" : null;
  }

  function metaFor(key: string) {
    const item = activePlacement(document.slots[key], now, visible);
    if (!item) return "Автоматично";
    const queue = (document.slots[key]?.items.length ?? 1) - 1;
    return queue > 0 ? `${remaining(item.endsAt, now)} · +${queue}` : remaining(item.endsAt, now);
  }

  const headEdit = editItems[0];
  const headTitle = headEdit ? known[headEdit.articleId]?.title ?? "Новина" : selected ? titleFor(selected) : null;
  const active = selected ? activePlacement(document.slots[selected], now, visible) : null;
  const activeCarouselPrefix = selected ? homeCarouselSlotPrefix(selected) : null;

  useEffect(() => {
    if (!selected) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeInspector();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected]);

  if (!ready) {
    return <p className="np-card p-4 text-sm text-muted">Екранът е готов. Приложете миграция 20_page_arrangements.sql и презаредете.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="mb-1 flex flex-wrap items-center gap-1.5">
        <a href={withBase("/arrange/?page=home")} className={`rounded-full px-3 py-1 text-xs font-bold ${pageKey === HOME_PAGE_KEY ? "bg-ink text-white" : "bg-surface-2 text-muted"}`}>Начало</a>
        {menu.map((item) => (
          <a key={item.id} href={withBase(`/arrange/?page=${item.id}`)} className={`rounded-full px-3 py-1 text-xs font-semibold ${pageKey === item.id ? "bg-ink text-white" : "bg-surface-2 text-muted"}`}>{item.name}</a>
        ))}
      </div>

      <div className="overflow-hidden rounded-[1.6rem] bg-[#070b22] p-4 text-white shadow-[0_30px_80px_-40px_rgb(7_11_34)] ring-1 ring-white/10">
        <p className="mb-3 text-[11px] font-semibold tracking-[0.16em] text-white/50 uppercase">{pageKey === HOME_PAGE_KEY ? "Начална страница" : category?.name ?? "Рубрика"} · кликнете кутията</p>
        {pageKey === HOME_PAGE_KEY ? (
          <HomeMap
            planned={planned}
            selected={selected}
            onSelect={openSlot}
            onEditCarousel={(prefix) => openSlot(homeCarouselSlotKey(prefix, 0))}
            titleFor={titleFor}
            metaFor={metaFor}
          />
        ) : (
          <CategoryMap
            name={category?.name ?? "Рубрика"}
            slug={category?.slug ?? ""}
            selected={selected}
            onSelect={openSlot}
            titleFor={titleFor}
            metaFor={metaFor}
          />
        )}
      </div>

      <div className="np-card flex flex-col gap-3 p-4">
        <label className="text-xs font-semibold text-muted">Бележка към смяната
          <textarea value={deskNote} onChange={(event) => setDeskNote(event.target.value)} maxLength={400} rows={2} className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent" />
        </label>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={busy} className="h-10 rounded-full bg-surface-2 px-5 text-sm font-bold text-ink" onClick={async () => { if (await send({ action: "save", pageKey, note: deskNote, document })) setMessage("Черновата е запазена."); }}>Запази чернова</button>
          <button type="button" disabled={busy} className="h-10 rounded-full bg-ink px-5 text-sm font-bold text-white" onClick={async () => {
            if (!await send({ action: "save", pageKey, note: deskNote, document })) return;
            if (await send({ action: "publish", pageKey })) setMessage("Подреждането е на сайта.");
          }}>Публикувай</button>
        </div>
        {message ? <p className="text-sm font-semibold text-ink">{message}</p> : null}
        <ExcludeBox document={document} known={known} onChange={setDocument} onKnow={(article) => setKnown((current) => ({ ...current, [article.id]: article }))} light />
        {history.length ? (
          <div className="border-t border-line pt-3">
            <p className="text-[11px] font-semibold tracking-[0.14em] text-muted uppercase">Предишни публикации</p>
            <ul className="mt-2 space-y-1">
              {history.map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-muted">{item.publishedAt ? new Date(item.publishedAt).toLocaleString("bg-BG") : "Без час"}</span>
                  <button type="button" className="font-bold text-link" disabled={busy} onClick={async () => { if (await send({ action: "revert", pageKey, historyId: item.id })) router.refresh(); }}>Върни</button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      {selected ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-[rgb(7_11_34/0.72)] p-0 sm:items-center sm:p-4"
          onClick={closeInspector}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="arrange-slot-heading"
            className="flex max-h-[min(92dvh,44rem)] w-full max-w-lg min-w-0 flex-col overflow-hidden rounded-t-[1.4rem] bg-[#101735] text-white shadow-2xl ring-1 ring-white/10 sm:rounded-[1.4rem]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-white/10 px-4 py-3">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold tracking-[0.14em] text-white/45 uppercase">{slotHeading(selected)}</p>
                <h2 id="arrange-slot-heading" className="mt-1 truncate text-lg font-extrabold tracking-tight">{headTitle ?? "Автоматично"}</h2>
                <p className="mt-1 text-xs text-white/60">{headEdit ? (headEdit.endsAt === null ? "Постоянно" : remaining(headEdit.endsAt, now)) : metaFor(selected)}{active?.placedBy && !headEdit ? ` · ${active.placedBy}` : ""}</p>
                {duplicates.includes(active?.articleId ?? "") ? <p className="mt-2 text-xs font-semibold text-amber-300">Тази новина вече е и на друго място.</p> : null}
              </div>
              <button type="button" className="shrink-0 rounded-full bg-white/10 px-3 py-1.5 text-xs font-bold" onClick={closeInspector}>Затвори</button>
            </div>

            <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-4 py-3">
              {activeCarouselPrefix ? (
                <CarouselOrderPanel
                  title={CAROUSEL_ROW_TITLES[activeCarouselPrefix]}
                  slotPrefix={activeCarouselPrefix}
                  count={HOME_CAROUSEL_COUNT}
                  titleFor={titleFor}
                  onMove={(index, delta) => moveCarouselSlot(activeCarouselPrefix, index, delta)}
                  onPick={openSlot}
                  activeKey={selected}
                />
              ) : null}

              <form onSubmit={search} className="mt-3 flex min-w-0 gap-1.5">
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Търсете новина" className={`${field} flex-1`} />
                <button type="submit" className="h-8 shrink-0 rounded-md bg-white px-3 text-xs font-bold text-[#101735]">Търси</button>
              </form>
              {results.length ? (
                <ul className="mt-2 max-h-40 divide-y divide-white/10 overflow-y-auto">
                  {results.map((article) => (
                    <li key={article.id} className="flex items-center gap-2 py-1.5">
                      <span className="min-w-0 flex-1 truncate text-xs">{article.title}</span>
                      <button type="button" className="rounded-full bg-white px-2 py-1 text-[11px] font-bold text-[#101735]" onClick={() => pickArticle(article, false)}>Сложи</button>
                      <button type="button" className="rounded-full bg-white/10 px-2 py-1 text-[11px] font-semibold" onClick={() => pickArticle(article, true)}>Време</button>
                    </li>
                  ))}
                </ul>
              ) : null}

              {headEdit ? (
                <div className="mt-3 grid min-w-0 gap-3">
                  <p className="text-[11px] font-semibold tracking-[0.12em] text-white/45 uppercase">Кога да е на мястото</p>
                  <div className="min-w-0">
                    <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                      <span className="text-[11px] text-white/55">От</span>
                      <button
                        type="button"
                        className="rounded-full bg-white/10 px-2.5 py-0.5 text-[11px] font-bold text-white hover:bg-white/20"
                        onClick={() => updateEditItem(0, { startsAt: nowIsoForSlot() })}
                      >
                        От сега
                      </button>
                    </div>
                    <input
                      type="datetime-local"
                      value={toLocalInput(headEdit.startsAt)}
                      className={field}
                      onChange={(event) => updateEditItem(0, { startsAt: fromLocalInput(event.target.value) })}
                    />
                    <p className="mt-1 text-[10px] text-white/40">Празно „От“ = веднага. „От сега“ попълва текущия час.</p>
                  </div>
                  <div className="min-w-0">
                    <label className="mb-1 flex min-w-0 items-center gap-2 text-[11px] text-white/55">
                      <span>До</span>
                      <label className="ml-auto flex shrink-0 items-center gap-1.5 text-xs font-semibold text-white/80">
                        <input
                          type="checkbox"
                          checked={headEdit.endsAt === null}
                          onChange={(event) => updateEditItem(0, {
                            endsAt: event.target.checked ? null : new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
                          })}
                        />
                        Без краен срок
                      </label>
                    </label>
                    <input
                      type="datetime-local"
                      disabled={headEdit.endsAt === null}
                      value={toLocalInput(headEdit.endsAt)}
                      className={`${field} disabled:opacity-40`}
                      onChange={(event) => updateEditItem(0, { endsAt: fromLocalInput(event.target.value) })}
                    />
                  </div>
                  {editItems.length > 1 ? (
                    <div className="min-w-0 border-t border-white/10 pt-2">
                      <p className="text-[11px] font-semibold text-white/45">След това (ред на опашката)</p>
                      {editItems.slice(1).map((item, index) => (
                        <div key={`${item.articleId}-${index}`} className="mt-1.5 flex min-w-0 items-center gap-2 text-xs text-white/70">
                          <span className="min-w-0 flex-1 truncate" title={known[item.articleId]?.title ?? "Новина"}>{known[item.articleId]?.title ?? "Новина"}</span>
                          <button type="button" className="shrink-0 rounded bg-white/10 px-1.5 py-0.5 font-bold" disabled={index === 0} onClick={() => moveQueueItemInDraft(index, -1)} aria-label="Нагоре">↑</button>
                          <button type="button" className="shrink-0 rounded bg-white/10 px-1.5 py-0.5 font-bold" disabled={index >= editItems.length - 2} onClick={() => moveQueueItemInDraft(index, 1)} aria-label="Надолу">↓</button>
                          <button type="button" className="shrink-0 font-semibold text-white" onClick={() => setEditItems((items) => items.filter((_, itemIndex) => itemIndex !== index + 1))}>Махни</button>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : (
                <p className="mt-3 text-xs text-white/55">„Сложи“ или „Време“, после „Запази на сайта“ — записва и пуска на публичното начало (или рубриката).</p>
              )}
              {inspectorError ? <p className="mt-2 text-xs font-semibold text-amber-300">{inspectorError}</p> : null}
            </div>
            <div className="flex flex-wrap items-center gap-2 border-t border-white/10 px-4 py-3">
              <button
                type="button"
                className="text-xs font-semibold text-white/60 underline-offset-2 hover:text-white hover:underline"
                onClick={() => {
                  setEditItems([]);
                  setInspectorError("");
                }}
              >
                Автоматично
              </button>
              <button type="button" className="ml-auto rounded-full bg-white/10 px-4 py-2 text-xs font-bold text-white" onClick={closeInspector}>Отказ</button>
              <button type="button" disabled={busy} className="rounded-full bg-white px-5 py-2 text-xs font-bold text-[#101735] disabled:opacity-50" onClick={() => void saveInspector()}>{busy ? "Запис…" : "Запази на сайта"}</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function CarouselOrderPanel({
  title,
  slotPrefix,
  count,
  titleFor,
  onMove,
  onPick,
  activeKey,
}: {
  title: string;
  slotPrefix: string;
  count: number;
  titleFor: (key: string) => string | null;
  onMove: (index: number, delta: number) => void;
  onPick: (key: string) => void;
  activeKey: string;
}) {
  return (
    <div className="rounded-xl bg-white/5 p-3 ring-1 ring-white/10">
      <p className="text-[11px] font-semibold tracking-[0.14em] text-white/45 uppercase">Подредба в карусела „{title}“</p>
      <p className="mt-1 text-[11px] text-white/45">Редът на местата 1–10 е редът на картите на сайта. Разменяйте с ↑ ↓.</p>
      <ol className="mt-2 space-y-1">
        {Array.from({ length: count }, (_, index) => {
          const key = `${slotPrefix}-${index}`;
          return (
            <li key={key} className={`flex items-center gap-2 rounded-lg px-2 py-1.5 ${activeKey === key ? "bg-white/10" : ""}`}>
              <span className="w-5 shrink-0 text-[11px] font-bold text-white/50">{index + 1}</span>
              <button type="button" className="min-w-0 flex-1 truncate text-left text-xs font-semibold hover:underline" onClick={() => onPick(key)}>
                {titleFor(key) ?? "Автоматично"}
              </button>
              <button type="button" disabled={index === 0} className="rounded bg-white/10 px-1.5 py-0.5 text-xs font-bold disabled:opacity-30" onClick={() => onMove(index, -1)} aria-label="Нагоре">↑</button>
              <button type="button" disabled={index >= count - 1} className="rounded bg-white/10 px-1.5 py-0.5 text-xs font-bold disabled:opacity-30" onClick={() => onMove(index, 1)} aria-label="Надолу">↓</button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function ExcludeBox({
  document,
  known,
  onChange,
  onKnow,
  light = false,
}: {
  document: ArrangementDocument;
  known: Record<string, ArrangementArticle>;
  onChange: (next: ArrangementDocument) => void;
  onKnow: (article: ArrangementArticle) => void;
  light?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ArrangementArticle[]>([]);
  const inputClass = light
    ? "h-8 w-full rounded-md border border-line bg-surface px-2 text-xs text-ink outline-none focus:border-accent"
    : field;
  return (
    <details className={light ? "border-t border-line pt-3" : "border-t border-white/10 pt-3"}>
      <summary className={`cursor-pointer text-[11px] font-semibold tracking-[0.14em] uppercase ${light ? "text-muted" : "text-white/45"}`}>Без автоматично място</summary>
      <form className="mt-2 flex gap-1.5" onSubmit={async (event) => {
        event.preventDefault();
        const response = await fetch(withBase(`/api/arrangements/search/?q=${encodeURIComponent(query)}`), { cache: "no-store" });
        const data = await response.json() as { articles?: ArrangementArticle[] };
        setResults(data.articles ?? []);
      }}>
        <input value={query} onChange={(event) => setQuery(event.target.value)} className={inputClass} placeholder="Заглавие" />
        <button className={`h-8 shrink-0 rounded-md px-2 text-xs font-bold ${light ? "bg-surface-2 text-ink" : "bg-white/10 text-white"}`} type="submit">Търси</button>
      </form>
      <ul className="mt-2 space-y-1 text-xs">
        {results.map((article) => (
          <li key={article.id}>
            <button type="button" className="text-left font-semibold" onClick={() => {
              onKnow(article);
              if (!document.excluded.includes(article.id)) onChange({ ...document, excluded: [...document.excluded, article.id] });
              setResults([]);
            }}>{article.title}</button>
          </li>
        ))}
        {document.excluded.map((id) => (
          <li key={id} className={`flex items-center justify-between gap-2 ${light ? "text-muted" : "text-white/70"}`}>
            <span className="truncate">{known[id]?.title ?? "Новина"}</span>
            <button type="button" className={`font-semibold ${light ? "text-link" : "text-white"}`} onClick={() => onChange({ ...document, excluded: document.excluded.filter((item) => item !== id) })}>Махни</button>
          </li>
        ))}
      </ul>
    </details>
  );
}

function Tile({
  slotKey,
  label,
  title,
  meta,
  selected,
  color,
  className = "",
  onSelect,
}: {
  slotKey: string;
  label: string;
  title: string | null;
  meta: string;
  selected: boolean;
  color: string;
  className?: string;
  onSelect: (key: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(slotKey)}
      className={`relative flex min-h-16 flex-col justify-end overflow-hidden rounded-2xl p-3 text-left transition ${selected ? "z-10 ring-2 ring-white ring-offset-2 ring-offset-[#070b22]" : "ring-1 ring-white/10 hover:-translate-y-0.5 hover:ring-white/40"} ${className}`}
      style={title
        ? { backgroundImage: `linear-gradient(180deg, rgb(7 11 34 / 0.05), rgb(7 11 34 / 0.82)), linear-gradient(145deg, ${color}, #12183a)` }
        : { background: "rgb(255 255 255 / 0.05)", boxShadow: `inset 0 0 0 1px ${color}55` }}
    >
      <span className="absolute top-2.5 left-3 h-1 w-8 rounded-full" style={{ background: color }} />
      <span className="mt-3 line-clamp-3 text-[13px] leading-snug font-extrabold tracking-tight">{title ?? label}</span>
      <span className="mt-1 truncate text-[10px] font-semibold tracking-wide text-white/65 uppercase">{title ? meta : "Автоматично"}</span>
    </button>
  );
}

function CarouselRow({
  title,
  hint,
  count,
  slotPrefix,
  color,
  selected,
  onSelect,
  onEditCarousel,
  titleFor,
  metaFor,
}: {
  title: string;
  hint?: string;
  count: number;
  slotPrefix: string;
  color: string;
  selected: string | null;
  onSelect: (key: string) => void;
  onEditCarousel?: () => void;
  titleFor: (key: string) => string | null;
  metaFor: (key: string) => string;
}) {
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1">
        <p className="text-[10px] font-bold tracking-[0.14em] text-white/50 uppercase">{title}</p>
        {hint ? <p className="text-[10px] text-white/35">{hint}</p> : null}
        {onEditCarousel ? (
          <button type="button" className="ml-auto rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-bold text-white hover:bg-white/20" onClick={onEditCarousel}>
            Подреди карусела
          </button>
        ) : null}
      </div>
      <div className="grid grid-cols-5 gap-2 xl:grid-cols-10">
        {Array.from({ length: count }, (_, index) => {
          const key = `${slotPrefix}-${index}`;
          return (
            <Tile
              key={key}
              slotKey={key}
              label={`${index + 1}`}
              title={titleFor(key)}
              meta={metaFor(key)}
              selected={selected === key}
              color={color}
              className="min-h-24 rounded-xl p-2"
              onSelect={onSelect}
            />
          );
        })}
      </div>
    </div>
  );
}

function StaticBlock({ title, detail, className = "" }: { title: string; detail: string; className?: string }) {
  return (
    <div className={`flex flex-col justify-center rounded-2xl bg-white/[0.04] px-4 py-3 ring-1 ring-white/10 ${className}`}>
      <p className="text-[10px] font-bold tracking-[0.14em] text-white/45 uppercase">{title}</p>
      <p className="mt-1 text-xs leading-snug text-white/55">{detail}</p>
    </div>
  );
}

function HomeMap({
  planned,
  selected,
  onSelect,
  onEditCarousel,
  titleFor,
  metaFor,
}: {
  planned: { main: HomeSectionPlan[]; aside: HomeSectionPlan[] };
  selected: string | null;
  onSelect: (key: string) => void;
  onEditCarousel: (prefix: HomeCarouselSlotPrefix) => void;
  titleFor: (key: string) => string | null;
  metaFor: (key: string) => string;
}) {
  const balIndex = planned.main.findIndex((section) => section.slug === "balgariya");
  const beforeSplit = planned.main.filter((section, index) => section.wide && index < balIndex);
  const bulgaria = planned.main.find((section) => section.slug === "balgariya");
  const afterSplit = planned.main.filter((section, index) => section.wide && index > balIndex);
  return (
    <div className="flex flex-col gap-4">
      <div className="grid h-[22rem] grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)_13rem] gap-3">
        <Tile slotKey="hero" label="Водеща" title={titleFor("hero")} meta={metaFor("hero")} selected={selected === "hero"} color="#5b6cff" className="h-full min-h-0" onSelect={onSelect} />
        <div className="grid min-h-0 grid-rows-[1.35fr_1fr] gap-3">
          <Tile slotKey="support-0" label="До водещата" title={titleFor("support-0")} meta={metaFor("support-0")} selected={selected === "support-0"} color="#7c5cff" className="min-h-0" onSelect={onSelect} />
          <div className="grid min-h-0 grid-cols-2 gap-3">
            <Tile slotKey="support-1" label="Малка" title={titleFor("support-1")} meta={metaFor("support-1")} selected={selected === "support-1"} color="#9b6bff" className="min-h-0" onSelect={onSelect} />
            <Tile slotKey="support-2" label="Малка" title={titleFor("support-2")} meta={metaFor("support-2")} selected={selected === "support-2"} color="#c46bff" className="min-h-0" onSelect={onSelect} />
          </div>
        </div>
        <div className="flex min-h-0 flex-col gap-2 rounded-2xl bg-white/5 p-2 ring-1 ring-white/10">
          <p className="px-1 text-[10px] font-bold tracking-[0.14em] text-white/50 uppercase">Последни</p>
          {Array.from({ length: HOME_LATEST_PIN_COUNT }, (_, index) => {
            const key = `latest-${index}`;
            return <Tile key={key} slotKey={key} label={`Отгоре ${index + 1}`} title={titleFor(key)} meta={metaFor(key)} selected={selected === key} color="#8ea2ff" className="min-h-0 flex-1 rounded-xl p-2" onSelect={onSelect} />;
          })}
        </div>
      </div>

      <CarouselRow
        title="На Фокус"
        hint="Новини от рубрика na-fokus · /na-fokus/"
        count={HOME_CAROUSEL_COUNT}
        slotPrefix="carousel"
        color="#5b6cff"
        selected={selected}
        onSelect={onSelect}
        onEditCarousel={() => onEditCarousel(HOME_FOCUS_CAROUSEL_PREFIX)}
        titleFor={titleFor}
        metaFor={metaFor}
      />

      <CarouselRow
        title="Топ теми"
        hint="Рубрика top-temi на стария сайт"
        count={HOME_CAROUSEL_COUNT}
        slotPrefix={HOME_TOP_THEMES_CAROUSEL_PREFIX}
        color="#7650c8"
        selected={selected}
        onSelect={onSelect}
        onEditCarousel={() => onEditCarousel(HOME_TOP_THEMES_CAROUSEL_PREFIX)}
        titleFor={titleFor}
        metaFor={metaFor}
      />

      {beforeSplit.map((section) => (
        <SectionBlock key={section.slug} section={section} selected={selected} onSelect={onSelect} titleFor={titleFor} metaFor={metaFor} />
      ))}

      {bulgaria ? (
        <>
          <StaticBlock title="Анкета" detail="Активната анкета от Studio → Анкети. Без слотове за подреждане." className="min-h-16" />
          <div className="grid grid-cols-[minmax(0,1fr)_16rem] gap-4">
            <div className="flex flex-col gap-3">
              <SectionBlock section={bulgaria} selected={selected} onSelect={onSelect} titleFor={titleFor} metaFor={metaFor} />
              <StaticBlock
                title="Банер NewsPoint.bg"
                detail="Снимка на Пловдив и слоганите под рубриката България. Само текст — без избор на новини."
                className="min-h-24 bg-gradient-to-r from-[#0c4fbe]/40 to-[#3818d6]/30"
              />
            </div>
            <div className="flex flex-col gap-3">
              {planned.aside.map((section) => (
                <SectionBlock key={section.slug} section={section} selected={selected} onSelect={onSelect} titleFor={titleFor} metaFor={metaFor} />
              ))}
            </div>
          </div>
          <CarouselRow
            title="Гласът на истината"
            hint="Рубрика glasat-na-istinata"
            count={HOME_CAROUSEL_COUNT}
            slotPrefix={HOME_VOICE_CAROUSEL_PREFIX}
            color={accent("glasat-na-istinata")}
            selected={selected}
            onSelect={onSelect}
            onEditCarousel={() => onEditCarousel(HOME_VOICE_CAROUSEL_PREFIX)}
            titleFor={titleFor}
            metaFor={metaFor}
          />
        </>
      ) : null}

      {afterSplit.map((section) => (
        <SectionBlock key={section.slug} section={section} selected={selected} onSelect={onSelect} titleFor={titleFor} metaFor={metaFor} />
      ))}

      <StaticBlock title="Долен банер" detail="„Защото истината има значение.“ — фиксиран бранд блок в края на началото." className="min-h-16" />
    </div>
  );
}

function SectionBlock({
  section,
  selected,
  onSelect,
  titleFor,
  metaFor,
}: {
  section: HomeSectionPlan;
  selected: string | null;
  onSelect: (key: string) => void;
  titleFor: (key: string) => string | null;
  metaFor: (key: string) => string;
}) {
  const color = accent(section.slug);
  const keys = Array.from({ length: section.count }, (_, index) => sectionSlotKey(section.slug, index));
  return (
    <section>
      <h3 className="mb-2 flex items-center gap-2 text-sm font-extrabold tracking-tight">
        <span className="h-4 w-1 rounded-full" style={{ background: color }} />
        {section.name}
      </h3>
      {section.aside ? (
        <div className="flex flex-col gap-2">
          {keys.map((key, index) => (
            <Tile key={key} slotKey={key} label={`Ред ${index + 1}`} title={titleFor(key)} meta={metaFor(key)} selected={selected === key} color={color} className="min-h-14 rounded-xl" onSelect={onSelect} />
          ))}
        </div>
      ) : section.layout === "feature" ? (
        <div className="grid grid-cols-[1.4fr_1fr] gap-2">
          <Tile slotKey={keys[0]!} label="Голяма" title={titleFor(keys[0]!)} meta={metaFor(keys[0]!)} selected={selected === keys[0]} color={color} className="min-h-40" onSelect={onSelect} />
          <div className="grid grid-cols-2 gap-2">
            {keys.slice(1).map((key, index) => (
              <Tile key={key} slotKey={key} label={`Малка ${index + 1}`} title={titleFor(key)} meta={metaFor(key)} selected={selected === key} color={color} className="min-h-16 rounded-xl" onSelect={onSelect} />
            ))}
          </div>
        </div>
      ) : (
        <div className={`grid gap-2 ${section.wide ? "grid-cols-2 sm:grid-cols-4 xl:grid-cols-5" : "grid-cols-2 sm:grid-cols-4"}`}>
          {keys.map((key, index) => (
            <Tile
              key={key}
              slotKey={key}
              label={index === 0 ? "Голяма" : `Малка ${index}`}
              title={titleFor(key)}
              meta={metaFor(key)}
              selected={selected === key}
              color={color}
              className={index === 0 ? (section.wide ? "col-span-2 row-span-2 min-h-36" : "col-span-2 row-span-2 min-h-32") : "min-h-16 rounded-xl"}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function CategoryMap({
  name,
  slug,
  selected,
  onSelect,
  titleFor,
  metaFor,
}: {
  name: string;
  slug: string;
  selected: string | null;
  onSelect: (key: string) => void;
  titleFor: (key: string) => string | null;
  metaFor: (key: string) => string;
}) {
  const color = accent(slug);
  return (
    <div className="flex flex-col gap-3">
      <Tile slotKey="lead" label="Голяма карта" title={titleFor("lead")} meta={metaFor("lead")} selected={selected === "lead"} color={color} className="min-h-52" onSelect={onSelect} />
      <p className="text-[10px] font-bold tracking-[0.14em] text-white/50 uppercase">Още от {name}</p>
      <div className="grid grid-cols-3 gap-2">
        {Array.from({ length: CATEGORY_NEXT_COUNT }, (_, index) => {
          const key = `next-${index}`;
          return <Tile key={key} slotKey={key} label={`Следваща ${index + 1}`} title={titleFor(key)} meta={metaFor(key)} selected={selected === key} color={color} className="min-h-28" onSelect={onSelect} />;
        })}
      </div>
    </div>
  );
}
