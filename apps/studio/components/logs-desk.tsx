"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { withBase } from "../lib/paths";
import { AUDIT_AREAS, AUDIT_OUTCOME_FILTERS, AUDIT_OUTCOMES, type AuditEntry, type AuditValue, type AuditView } from "../lib/audit-types";
import type { AuditChange } from "../lib/audit-metadata";
import "./logs-desk.css";

const roles = { editor: "Редактор", admin: "Администратор", master_admin: "Masteradmin" };
const initial = { q: "", actor: "", area: "", action: "", outcome: "", role: "", period: "7d", from: "", to: "", sort: "newest", size: "50", page: "1", anchor: "" };
const fieldNames: Record<string, string> = { title: "Заглавие", slug: "Адрес", excerpt: "Увод", body: "Съдържание", primaryCategoryId: "Рубрика", heroMediaId: "Основна снимка", heroEmbedUrl: "Видео", authorKind: "Тип автор", authorUserId: "Автор", authorName: "Име на автор", listenEnabled: "Озвучаване", isPublic: "Видимост", isPublished: "Публикувана тема", publishedRevision: "Публикувана версия", scheduledPublishAt: "Насрочване", startsAt: "Начало", endsAt: "Край", role: "Роля", status: "Статус", question: "Въпрос", options: "Отговори", adjustments: "Корекции", note: "Бележка", excluded: "Изключени статии", seedCount: "Начални прочитания", targetCount: "Цел", intervalSeconds: "Интервал (сек.)", document: "Подреждане", slots: "Позиции", items: "Опашка", number: "Версия", bio: "Биография" };
const timeFormat = new Intl.DateTimeFormat("bg-BG", { timeZone: "Europe/Sofia", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
const time = (value: string) => { const parts = Object.fromEntries(timeFormat.formatToParts(new Date(value)).map(part => [part.type, part.value])); return `${parts.day}.${parts.month}.${parts.year} ${parts.hour}:${parts.minute}:${parts.second}`; };
function fieldLabel(path: string) { return path.split(".").map(part => fieldNames[part] || part).join(" › "); }
function Value({ value, titles, field = "" }: { value: AuditValue; titles: Record<string, string>; field?: string }) {
  if (value === null) return <span className="np-log-muted">{field.endsWith("endsAt") ? "Без срок" : field.endsWith("startsAt") ? "Веднага" : "—"}</span>;
  if (typeof value === "boolean") return <span>{value ? "Да" : "Не"}</span>;
  if (typeof value === "string") return <span className="np-log-value" title={value}>{/At$/.test(field) && /T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value)) ? time(value) : titles[value] ? `${titles[value]} (${value})` : field.endsWith("role") && roles[value as keyof typeof roles] ? roles[value as keyof typeof roles] : value || "(празно)"}</span>;
  if (typeof value === "number") return <span>{value}</span>;
  if (Array.isArray(value)) return value.length ? <ol className="np-log-values">{value.map((item, index) => <li key={index}><Value value={item} titles={titles} /></li>)}</ol> : <span className="np-log-muted">(няма)</span>;
  return <dl className="np-log-object">{Object.entries(value).map(([key, item]) => <Fragment key={key}><dt>{fieldNames[key] || key}</dt><dd><Value value={item} titles={titles} field={key} /></dd></Fragment>)}</dl>;
}
function Details({ row }: { row: AuditEntry }) {
  const changes = Array.isArray(row.details.changes) ? row.details.changes as unknown as AuditChange[] : [];
  const titles = (row.details.articleTitles || {}) as Record<string, string>;
  const [copied, setCopied] = useState(false);
  const technical = Object.fromEntries(Object.entries(row.details).filter(([key]) => !["changes", "articleTitles", "stateSource"].includes(key)));
  return <div className="np-log-details">
    <div className="np-log-detail-bar"><span>{row.actorName || "Неидентифициран"} · {row.actorEmail || "—"} · {row.actorRole ? roles[row.actorRole] : "—"}</span><span>{row.method} {row.path}</span><span>Завършване: {time(row.occurredAt)}</span><span>HTTP {row.statusCode ?? "—"} · {row.durationMs ?? "—"} ms</span>
      <button data-help="Копира идентификатора на този запис за точно намиране при проверка." type="button" onClick={async () => { try { await navigator.clipboard.writeText(row.id); setCopied(true); } catch { setCopied(false); } }}>{copied ? "ID копирано" : "Копирай ID"}</button>
      {row.targetPath ? <a href={withBase(row.targetPath)} target="_blank" rel="noreferrer">Отвори материала ↗</a> : null}
    </div>
    {row.outcome === "pending" ? <p>Има запис за започване на заявката. Завършването ѝ не е потвърдено.</p> : null}
    {row.details.detailsUnavailable ? <p>Подробното състояние не беше достъпно при тази заявка. Резултатът и наличните параметри са запазени.</p> : null}
    {changes.length ? <div className="np-log-change-scroll"><table className="np-log-changes"><thead><tr><th>Промяна</th><th>Преди</th><th>След</th></tr></thead><tbody>{changes.map((change, index) => <tr key={index}><th scope="row">{fieldLabel(change.field)}</th><td><Value value={change.before} titles={titles} field={change.field} /></td><td><Value value={change.after} titles={titles} field={change.field} /></td></tr>)}</tbody></table></div>
      : row.outcome === "success" ? <p className="np-log-muted">{row.method === "GET" ? "Преглед или търсене — без промяна на съдържанието." : "Няма разлика в записаното състояние. Параметрите и резултатът са по-долу."}</p> : null}
    <details className="np-log-technical"><summary>Параметри и информация за заявката</summary><dl className="np-log-object"><dt>ID</dt><dd>{row.id}</dd><dt>Начало UTC</dt><dd>{row.startedAt}</dd><dt>Край UTC</dt><dd>{row.occurredAt}</dd><dt>IP на заявката</dt><dd>{row.ip || "—"}</dd><dt>Браузър</dt><dd>{row.userAgent || "—"}</dd></dl><Value value={technical} titles={titles} /></details>
  </div>;
}

export function LogsDesk() {
  const [filters, setFilters] = useState(initial);
  const [mounted, setMounted] = useState(false);
  const [data, setData] = useState<AuditView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [exporting, setExporting] = useState(false);
  const requestNumber = useRef(0);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const restored = { ...initial }; for (const key of Object.keys(initial) as (keyof typeof initial)[]) restored[key] = params.get(key) ?? initial[key];
    setFilters(restored); setMounted(true);
  }, []);
  useEffect(() => {
    if (!mounted) return;
    setLoading(true);
    const controller = new AbortController();
    const number = ++requestNumber.current;
    const timer = setTimeout(async () => {
      setLoading(true); setError("");
      const params = new URLSearchParams(filters);
      try {
        const response = await fetch(`${withBase("/api/logs/")}?${params}`, { cache: "no-store", signal: controller.signal });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Историята е недостъпна.");
        if (controller.signal.aborted || number !== requestNumber.current) return;
        const view = result as AuditView; setData(view);
        const canonical = new URLSearchParams(Object.entries(view.filters).map(([key, value]) => [key, String(value)]));
        history.replaceState(history.state, "", `${window.location.pathname}?${canonical}`);
      } catch (failure) { if (!controller.signal.aborted && number === requestNumber.current) setError(failure instanceof Error ? failure.message : "Историята е недостъпна."); }
      finally { if (!controller.signal.aborted && number === requestNumber.current) setLoading(false); }
    }, 300);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [filters, mounted, refresh]);
  function change(key: keyof typeof initial, value: string) { setFilters(current => ({ ...current, [key]: value, page: "1", anchor: "" })); setExpanded(null); }
  function page(value: number) { setFilters(current => ({ ...current, page: String(value), anchor: data?.filters.anchor || "" })); setExpanded(null); }
  const filterHelp: Record<string, string> = {"period":"Показва действията от избрания период по софийско време.","actor":"Показва действията само на избрания служител.","role":"Ролята, която служителят е имал при записаното действие.","area":"Ограничава историята до избран раздел на Studio.","action":"Показва само избрания вид действие.","outcome":"Филтрира успешни, отказани или неуспешни действия.","sort":"Определя подредбата на записите в историята.","size":"Броят записи на една страница от историята."};
  function select(key: keyof typeof initial, label: string, options: [string, string][]) { return <label><span>{label}</span><select data-help={filterHelp[key]} value={filters[key]} onChange={event => change(key, event.target.value)} aria-label={label}>{options.map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></label>; }
  async function exportCsv() {
    setExporting(true); setError("");
    try {
      const params = new URLSearchParams({ ...filters, anchor: data?.filters.anchor || "", export: "csv" });
      const response = await fetch(`${withBase("/api/logs/")}?${params}`, { cache: "no-store" });
      if (!response.ok) throw new Error((await response.json()).error || "Износът не беше успешен.");
      const url = URL.createObjectURL(await response.blob()); const link = document.createElement("a"); link.href = url; link.download = "newspoint-logs.csv"; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Износът не беше успешен."); }
    finally { setExporting(false); }
  }
  return <section className="np-logs" aria-label="История на служителите">
    <header className="np-log-header"><div><h1 data-help="История кой какво е направил в Studio, кога и с какъв резултат. Часовете са за София.">Logs</h1><span>История на действията · часът е за София</span></div><div className="np-log-buttons"><button type="button" disabled={loading} onClick={() => { setFilters(current => ({ ...current, page: "1", anchor: "" })); setRefresh(value => value + 1); }}>Обнови</button><button data-help="Изтегля записите според текущите филтри като CSV файл за преглед в таблица." type="button" disabled={exporting || !data?.ready || loading || !!error} onClick={exportCsv}>{exporting ? "Изнасяне…" : "CSV ↓"}</button></div></header>
    <div className="np-log-filters"><label className="np-log-search"><span>Търсене</span><input data-help="Търси по служител, статия, промяна, идентификатор или IP адрес." type="search" value={filters.q} maxLength={240} placeholder="Служител, статия, промяна, ID или IP…" onChange={event => change("q", event.target.value)} /></label>
      {select("period", "Период", [["today", "Днес"], ["yesterday", "Вчера"], ["7d", "Последни 7 дни"], ["30d", "Последни 30 дни"], ["all", "Всички дати"], ["custom", "Избери дати"]])}
      {filters.period === "custom" ? <><label><span>От</span><input data-help="Ограничава историята до избраните дати по софийско време." aria-label="От дата" type="date" value={filters.from} onChange={event => change("from", event.target.value)} /></label><label><span>До включително</span><input data-help="Ограничава историята до избраните дати по софийско време." aria-label="До дата" type="date" value={filters.to} onChange={event => change("to", event.target.value)} /></label></> : null}
      {select("actor", "Служител", [["", "Всички служители"], ...(data?.actors ?? []).map(actor => [actor.id, `${actor.name} · ${actor.email}`] as [string, string])])}
      {select("role", "Роля при действието", [["", "Всички роли"], ...Object.entries(roles)])}
      {select("area", "Раздел", [["", "Всички раздели"], ...Object.entries(AUDIT_AREAS)])}
      {select("action", "Действие", [["", "Всички действия"], ...(data?.actions ?? []).map(action => [action.value, action.label] as [string, string])])}
      {select("outcome", "Резултат", [["", "Всички резултати"], ...Object.entries(AUDIT_OUTCOME_FILTERS)])}
      {select("sort", "Сортиране", [["newest", "Най-нови"], ["oldest", "Най-стари"], ["actor", "Служител А–Я"], ["action", "Действие А–Я"], ["entity", "Обект А–Я"], ["outcome", "Резултат"], ["duration", "Най-бавни"]])}
      {select("size", "На страница", [["25", "25 записа"], ["50", "50 записа"], ["100", "100 записа"]])}
      <button data-help="Премахва текущите филтри и връща началния изглед на историята." className="np-log-reset" type="button" onClick={() => { setFilters({ ...initial }); setExpanded(null); }}>Изчисти</button>
    </div>
    {error ? <p className="np-log-notice np-log-error" role="alert">{error}</p> : null}
    {data && !data.ready ? <p className="np-log-notice">Историята очаква активиране на базата с миграция 31. Новите действия се съхраняват в защитения буфер ({data.buffered} записа) и ще се прехвърлят след активирането.</p> : data?.buffered ? <p className="np-log-notice">В буфера има {data.buffered} записа за прехвърляне. Обновете, за да продължи синхронизирането.</p> : null}
    <div className="np-log-summary" aria-live="polite"><span>{loading ? "Зареждане…" : data?.ready ? `${data.total.toLocaleString("bg-BG")} записа · страница ${data.page} от ${data.pages}` : "Историята още не е активна"}</span><span>Детайлите се отварят от реда</span></div>
    <div className="np-log-table-scroll" aria-busy={loading}><table className="np-log-table"><thead><tr><th><button onClick={() => change("sort", filters.sort === "newest" ? "oldest" : "newest")}>Дата и час {filters.sort === "newest" ? "↓" : filters.sort === "oldest" ? "↑" : "↕"}</button></th><th>Служител</th><th>Раздел / действие</th><th>Обект</th><th data-help="Показва дали действието е изпълнено, отказано или завършило с грешка.">Резултат</th><th data-help="Мрежовият адрес, от който е направено действието. Един адрес може да се ползва от няколко души.">IP</th><th><span className="sr-only">Детайли</span></th></tr></thead><tbody>
      {data?.ready && data.rows.length ? data.rows.map(row => <Fragment key={row.id}><tr className={expanded === row.id ? "np-log-open" : ""}><td className="np-log-time" title={row.startedAt}>{time(row.startedAt)}</td><td><strong>{row.actorName || "Неидентифициран"}</strong><small>{row.actorEmail || "Без потвърден вход"}</small><small>{row.actorRole ? roles[row.actorRole] : ""}</small></td><td><strong>{row.actionLabel}</strong><small>{AUDIT_AREAS[row.area]}</small></td><td className="np-log-entity"><span title={row.entityLabel || row.entityId}>{row.entityLabel || row.entityId || "—"}</span><small title={row.entityId}>{row.entityLabel ? row.entityId : ""}</small></td><td><span className={`np-log-result np-log-${row.outcome}`}>{AUDIT_OUTCOMES[row.outcome]}</span><small>{row.statusCode ?? "—"} · {row.durationMs ?? "—"} ms</small></td><td className="np-log-ip">{row.ip || "—"}</td><td><button data-help="Отваря подробности за действието, включително записаните промени и резултата." className="np-log-expand" type="button" aria-expanded={expanded === row.id} aria-controls={`log-${row.id}`} aria-label={`Детайли: ${row.actionLabel} ${row.entityLabel}`} onClick={() => setExpanded(expanded === row.id ? null : row.id)}>{expanded === row.id ? "−" : "+"}</button></td></tr>{expanded === row.id ? <tr id={`log-${row.id}`}><td colSpan={7}><Details row={row} /></td></tr> : null}</Fragment>)
        : <tr><td colSpan={7} className="np-log-empty">{loading ? "Зареждане на историята…" : error ? "Историята не е заредена." : data?.ready ? "Няма записи за избраните филтри." : "Записите ще се покажат след активиране на историята."}</td></tr>}
    </tbody></table></div>
    <footer className="np-log-footer"><span>{data?.ready ? `${data.rows.length} показани` : "—"}</span><div className="np-log-buttons"><button type="button" disabled={loading || !data?.ready || data.page <= 1} onClick={() => page((data?.page || 1) - 1)}>← Предишна</button><span>{data?.page ?? 1} / {data?.pages ?? 1}</span><button type="button" disabled={loading || !data?.ready || data.page >= data.pages} onClick={() => page((data?.page || 1) + 1)}>Следваща →</button></div></footer>
  </section>;
}
