"use client";

import { useEffect, useState } from "react";
import { BREAKING_TEXT_LIMIT, type BreakingSettings } from "@newspoint/content";
import { withBase } from "@/lib/paths";
import type { ArrangementArticle } from "@/lib/arrangement-types";

export function BreakingControl({ initial }: { initial: BreakingSettings }) {
  const [state, setState] = useState(initial);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ArrangementArticle[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [conflict, setConflict] = useState(false);
  useEffect(() => {
    setResults([]);
    if (query.trim().length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void fetch(withBase(`/api/arrangements/search/?q=${encodeURIComponent(query)}`), { cache: "no-store", signal: controller.signal })
        .then(async response => { if (!response.ok) throw new Error(); return response.json(); })
        .then(data => setResults(data.articles ?? []))
        .catch(() => { if (!controller.signal.aborted) setMessage("Търсенето не успя. Опитайте отново."); });
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query]);

  async function save(reload = false) {
    setBusy(true); setMessage("");
    try {
      const response = await fetch(withBase("/api/breaking/"), { method: reload ? "GET" : "POST", cache: "no-store",
        signal: AbortSignal.timeout(15_000),
        ...(reload ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify({ expectedVersion: state.version, enabled: state.enabled, text: state.text, articleId: state.articleId }) }) });
      const data = await response.json();
      if (!response.ok) { setConflict(response.status === 409); throw new Error(data.error?.message ?? "Записът не успя."); }
      setState(data); setConflict(false); setQuery("");
      setMessage(reload ? "Заредени са актуалните настройки." : data.enabled ? "Лентата е включена. Промяната се изпраща към читателите." : "Лентата е скрита.");
    } catch (error) { setMessage(error instanceof Error && error.name !== "TimeoutError" ? error.message : "Няма отговор. Проверете връзката и опитайте отново."); }
    finally { setBusy(false); }
  }

  return <section className="np-card mb-4 p-4" aria-labelledby="breaking-control-title">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 data-help="Кратка извънредна лента под LivePoint на началната страница и рубриките. Промените се изпращат и към отворените страници." id="breaking-control-title" className="text-sm font-bold text-ink"><span className="mr-2 inline-block rounded bg-red-700 px-2 py-1 text-xs text-white">ИЗВЪНРЕДНО</span>Лента под LivePoint</h2>
      <label data-help="Включва или скрива извънредната лента след натискане на Запази." className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={state.enabled} disabled={busy || !state.ready} onChange={event => setState({ ...state, enabled: event.target.checked })} />Показвай</label>
    </div>
    {!state.ready ? <p className="mt-2 text-sm text-muted">Приложете миграция 40_breaking_bulletins.sql и презаредете.</p> : <fieldset disabled={busy} className="mt-3 flex min-w-0 flex-col gap-3">
      <label className="text-sm font-semibold">Съобщение
        <textarea data-help="Текстът, който ще се движи в лентата. Напишете до 2–3 кратки изречения." aria-label="Съобщение" rows={2} maxLength={BREAKING_TEXT_LIMIT} value={state.text} onChange={event => setState({ ...state, text: event.target.value })} className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink" aria-describedby="breaking-text-help" />
        <span id="breaking-text-help" className="mt-1 flex justify-between gap-2 text-xs font-normal text-muted"><span>До 2–3 кратки изречения. Начална и рубрики, включително мобилно/PWA.</span><span className="shrink-0">{state.text.length}/{BREAKING_TEXT_LIMIT}</span></span>
      </label>
      <div className="text-sm">
        {state.articleId ? <div className="flex items-center gap-3"><span>Към: <strong>{state.articleTitle ?? "Недостъпна статия"}</strong></span><button data-help="Оставя съобщението без връзка към новина след запис." type="button" className="shrink-0 font-semibold text-link" onClick={() => setState({ ...state, articleId: null, articleTitle: null })}>Премахни връзката</button></div> : <label className="block font-semibold">Статия <span className="font-normal text-muted">(по избор)</span><input data-help="Намерете публикувана новина, към която да води лентата при натискане. Връзката не е задължителна." type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Търси публикувана статия…" className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 font-normal text-ink" /></label>}
        {results.length > 0 && !state.articleId ? <ul className="mt-2 max-h-52 overflow-auto rounded-lg border border-line">{results.map(article => <li key={article.id}><button type="button" className="w-full px-3 py-2 text-left hover:bg-surface-2" onClick={() => { setState({ ...state, articleId: article.id, articleTitle: article.title }); setQuery(""); setResults([]); }}>{article.title}</button></li>)}</ul> : null}
      </div>
      <div className="flex items-center gap-3"><button data-help="Записва текста, връзката и видимостта. Отворените страници получават промяната без презареждане." type="button" disabled={busy || conflict || state.enabled && !state.text.trim()} className="rounded-full bg-ink px-5 py-2 text-sm font-bold text-white disabled:opacity-50" onClick={() => void save()}>Запази</button>{conflict ? <button data-help="Зарежда последния запис от Studio. Вашите незаписани промени в тази лента ще се заменят." type="button" className="text-sm font-semibold text-link" onClick={() => void save(true)}>Зареди актуалните настройки</button> : null}</div>
    </fieldset>}
    {message ? <p role="status" className="mt-2 text-sm text-ink">{message}</p> : null}
  </section>;
}
