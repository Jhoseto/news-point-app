"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  CATEGORY_NEXT_COUNT,
  HOME_CAROUSEL_COUNT,
  HOME_LATEST_PIN_COUNT,
  HOME_PAGE_KEY,
  activePlacement,
  duplicateArticleIds,
  planHomeSections,
  sectionSlotKey,
  type ArrangementDocument,
  type ArrangementItem,
  type HomeSectionPlan,
} from "@newspoint/content";
import type { ArrangementArticle, ArrangementHistoryItem, MenuCategory } from "@/lib/arrangement-types";
import { withBase } from "@/lib/paths";

const field = "h-8 w-full rounded-md border border-white/15 bg-white/10 px-2 text-xs text-white outline-none placeholder:text-white/40 focus:border-white/40";

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
};

function accent(slug?: string) {
  return (slug && ACCENTS[slug]) || "#5b6cff";
}

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
  const [document, setDocument] = useState(draft);
  const [deskNote, setDeskNote] = useState(note);
  const [known, setKnown] = useState(articles);
  const [selected, setSelected] = useState(pageKey === HOME_PAGE_KEY ? "hero" : "lead");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ArrangementArticle[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const visible = useMemo(() => new Set(Object.values(known).filter((article) => article.isPublic).map((article) => article.id)), [known]);
  const duplicates = duplicateArticleIds(document, now, visible);
  const planned = planHomeSections(menu);
  const category = menu.find((item) => item.id === pageKey);

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

  const current = slotItems(selected)[0];
  const active = activePlacement(document.slots[selected], now, visible);

  if (!ready) {
    return <p className="np-card p-4 text-sm text-muted">Екранът е готов. Приложете миграция 20_page_arrangements.sql и презаредете.</p>;
  }

  return (
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="min-w-0">
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
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
              onSelect={(key) => { setSelected(key); setNow(Date.now()); setResults([]); }}
              titleFor={titleFor}
              metaFor={metaFor}
            />
          ) : (
            <CategoryMap
              name={category?.name ?? "Рубрика"}
              slug={category?.slug ?? ""}
              selected={selected}
              onSelect={(key) => { setSelected(key); setNow(Date.now()); setResults([]); }}
              titleFor={titleFor}
              metaFor={metaFor}
            />
          )}
        </div>
      </div>

      <aside className="sticky top-3 flex flex-col gap-3 rounded-[1.4rem] bg-[#101735] p-4 text-white ring-1 ring-white/10">
        <div>
          <p className="text-[11px] font-semibold tracking-[0.14em] text-white/45 uppercase">Избрана кутия</p>
          <h2 className="mt-1 text-lg font-extrabold tracking-tight">{titleFor(selected) ?? "Автоматично"}</h2>
          <p className="mt-1 text-xs text-white/60">{metaFor(selected)}{active?.placedBy ? ` · ${active.placedBy}` : ""}</p>
          {duplicates.includes(active?.articleId ?? "") ? <p className="mt-2 text-xs font-semibold text-amber-300">Тази новина вече е и на друго място.</p> : null}
        </div>

        <form onSubmit={search} className="flex gap-1.5">
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Търсете новина" className={field} />
          <button type="submit" className="h-8 shrink-0 rounded-md bg-white px-3 text-xs font-bold text-[#101735]">Търси</button>
        </form>
        {results.length ? (
          <ul className="max-h-48 divide-y divide-white/10 overflow-y-auto">
            {results.map((article) => (
              <li key={article.id} className="flex items-center gap-2 py-1.5">
                <span className="min-w-0 flex-1 truncate text-xs">{article.title}</span>
                <button type="button" className="rounded-full bg-white px-2 py-1 text-[11px] font-bold text-[#101735]" onClick={() => choose(article, false)}>Сложи</button>
                <button type="button" className="rounded-full bg-white/10 px-2 py-1 text-[11px] font-semibold" onClick={() => choose(article, true)}>Опашка</button>
              </li>
            ))}
          </ul>
        ) : null}

        {current ? (
          <div className="grid gap-2">
            <label className="flex items-center gap-2 text-xs font-semibold">
              <input
                type="checkbox"
                checked={current.endsAt === null}
                onChange={(event) => {
                  const items = [...slotItems(selected)];
                  items[0] = { ...current, endsAt: event.target.checked ? null : new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString() };
                  writeSlot(selected, items);
                }}
              />
              Да стои постоянно
            </label>
            <label className="text-[11px] text-white/55">От
              <input type="datetime-local" value={toLocalInput(current.startsAt)} className={`${field} mt-1`} onChange={(event) => {
                const items = [...slotItems(selected)];
                items[0] = { ...current, startsAt: fromLocalInput(event.target.value) };
                writeSlot(selected, items);
              }} />
            </label>
            <label className="text-[11px] text-white/55">До
              <input type="datetime-local" disabled={current.endsAt === null} value={toLocalInput(current.endsAt)} className={`${field} mt-1 disabled:opacity-40`} onChange={(event) => {
                const items = [...slotItems(selected)];
                items[0] = { ...current, endsAt: fromLocalInput(event.target.value) };
                writeSlot(selected, items);
              }} />
            </label>
            {slotItems(selected).slice(1).map((item, index) => (
              <div key={`${item.articleId}-${index}`} className="flex items-center justify-between gap-2 text-xs text-white/70">
                <span className="truncate">След нея: {known[item.articleId]?.title ?? "Новина"}</span>
                <button type="button" className="shrink-0 font-semibold text-white" onClick={() => writeSlot(selected, slotItems(selected).filter((_, itemIndex) => itemIndex !== index + 1))}>Махни</button>
              </div>
            ))}
            <button type="button" className="text-left text-xs font-semibold text-white/70 underline-offset-2 hover:underline" onClick={() => writeSlot(selected, [])}>Върни към автоматично</button>
          </div>
        ) : <p className="text-xs text-white/55">Празното място се пълни само, както е на сайта сега.</p>}

        <label className="text-[11px] text-white/55">Бележка към смяната
          <textarea value={deskNote} onChange={(event) => setDeskNote(event.target.value)} maxLength={400} rows={2} className={`${field} mt-1 py-1`} />
        </label>
        <div className="flex gap-1.5">
          <button type="button" disabled={busy} className="h-9 flex-1 rounded-full bg-white/10 text-xs font-bold" onClick={async () => { if (await send({ action: "save", pageKey, note: deskNote, document })) setMessage("Черновата е запазена."); }}>Запази</button>
          <button type="button" disabled={busy} className="h-9 flex-1 rounded-full bg-white text-xs font-bold text-[#101735]" onClick={async () => {
            if (!await send({ action: "save", pageKey, note: deskNote, document })) return;
            if (await send({ action: "publish", pageKey })) setMessage("Подреждането е на сайта.");
          }}>Публикувай</button>
        </div>
        {message ? <p className="text-xs font-semibold">{message}</p> : null}
        <ExcludeBox document={document} known={known} onChange={setDocument} onKnow={(article) => setKnown((current) => ({ ...current, [article.id]: article }))} />
        {history.length ? (
          <div className="border-t border-white/10 pt-3">
            <p className="text-[11px] font-semibold tracking-[0.14em] text-white/45 uppercase">Предишни</p>
            <ul className="mt-2 space-y-1">
              {history.map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-2 text-xs">
                  <span className="text-white/60">{item.publishedAt ? new Date(item.publishedAt).toLocaleString("bg-BG") : "Без час"}</span>
                  <button type="button" className="font-bold" disabled={busy} onClick={async () => { if (await send({ action: "revert", pageKey, historyId: item.id })) router.refresh(); }}>Върни</button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
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
    <details className="border-t border-white/10 pt-3">
      <summary className="cursor-pointer text-[11px] font-semibold tracking-[0.14em] text-white/45 uppercase">Без автоматично място</summary>
      <form className="mt-2 flex gap-1.5" onSubmit={async (event) => {
        event.preventDefault();
        const response = await fetch(withBase(`/api/arrangements/search/?q=${encodeURIComponent(query)}`), { cache: "no-store" });
        const data = await response.json() as { articles?: ArrangementArticle[] };
        setResults(data.articles ?? []);
      }}>
        <input value={query} onChange={(event) => setQuery(event.target.value)} className={field} placeholder="Заглавие" />
        <button className="h-8 shrink-0 rounded-md bg-white/10 px-2 text-xs font-bold" type="submit">Търси</button>
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
          <li key={id} className="flex items-center justify-between gap-2 text-white/70">
            <span className="truncate">{known[id]?.title ?? "Новина"}</span>
            <button type="button" className="font-semibold text-white" onClick={() => onChange({ ...document, excluded: document.excluded.filter((item) => item !== id) })}>Махни</button>
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

function HomeMap({
  planned,
  selected,
  onSelect,
  titleFor,
  metaFor,
}: {
  planned: { main: HomeSectionPlan[]; aside: HomeSectionPlan[] };
  selected: string;
  onSelect: (key: string) => void;
  titleFor: (key: string) => string | null;
  metaFor: (key: string) => string;
}) {
  const narrow = planned.main.filter((section) => !section.wide);
  const wide = planned.main.filter((section) => section.wide);
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

      <div>
        <p className="mb-2 text-[10px] font-bold tracking-[0.14em] text-white/50 uppercase">На фокус</p>
        <div className="grid grid-cols-5 gap-2 xl:grid-cols-10">
          {Array.from({ length: HOME_CAROUSEL_COUNT }, (_, index) => {
            const key = `carousel-${index}`;
            return <Tile key={key} slotKey={key} label={`${index + 1}`} title={titleFor(key)} meta={metaFor(key)} selected={selected === key} color="#5b6cff" className="min-h-24 rounded-xl p-2" onSelect={onSelect} />;
          })}
        </div>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_16rem] gap-4">
        <div className="flex flex-col gap-4">
          {narrow.map((section) => (
            <SectionBlock key={section.slug} section={section} selected={selected} onSelect={onSelect} titleFor={titleFor} metaFor={metaFor} />
          ))}
        </div>
        <div className="flex flex-col gap-3">
          {planned.aside.map((section) => (
            <SectionBlock key={section.slug} section={section} selected={selected} onSelect={onSelect} titleFor={titleFor} metaFor={metaFor} />
          ))}
        </div>
      </div>

      {wide.map((section) => (
        <SectionBlock key={section.slug} section={section} selected={selected} onSelect={onSelect} titleFor={titleFor} metaFor={metaFor} />
      ))}
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
  selected: string;
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
        <div className="grid grid-cols-4 gap-2">
          {keys.map((key, index) => (
            <Tile key={key} slotKey={key} label={index === 0 ? "Голяма" : `Малка ${index}`} title={titleFor(key)} meta={metaFor(key)} selected={selected === key} color={color} className={index === 0 ? "col-span-2 row-span-2 min-h-36" : "min-h-16 rounded-xl"} onSelect={onSelect} />
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
  selected: string;
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
