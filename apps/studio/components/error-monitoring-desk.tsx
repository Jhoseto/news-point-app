"use client";
import { useEffect, useState } from "react";
import { MONITOR_STALE_MS, type Cycle, type Incident, type MonitoringView, type MonitorState } from "@newspoint/content/error-monitoring";
import { markMonitoringSeen, useMonitoring } from "../lib/error-monitoring-client";
import "./error-monitoring-desk.css";

const labels: Record<string, string> = { "web-home": "Начална страница · вътрешно", "web-static": "Файлове · вътрешно", "web-login-rewrite": "Вход през Web", "studio-login": "Studio · директно", "public-home": "Начална страница", "public-login": "Вход в Studio", "public-static": "Файлове", "public-sse": "Live поток · първи байт", "public-home-h2": "Начална · HTTP/2", "public-static-h2": "Файлове · HTTP/2" };
const outcomes: Record<string, string> = { ok: "Успешна", timeout: "Няма отговор в срока", "http-error": "HTTP грешка", "cloudflare-challenge": "Проверка от Cloudflare", denied: "Отказан достъп", "unexpected-content-type": "Неочакван отговор", "body-limit": "Над размера за проверка", "empty-body": "Празен отговор", truncated: "Прекъснат отговор", "connection-error": "Проблем с връзката", "tls-error": "Проблем със сертификата", "tls-or-h2-connection-error": "TLS / HTTP/2 връзка" };
const kinds: Record<Incident["kind"], string> = { failure: "Неуспешни проверки", slow: "Забавяне", "access-limited": "Ограничен достъп за проверката", "observation-gap": "Пауза в наблюдението" };
const format = new Intl.DateTimeFormat("bg-BG", { timeZone: "Europe/Sofia", dateStyle: "short", timeStyle: "medium" });
const time = (v: string | null | undefined) => v && Number.isFinite(Date.parse(v)) ? format.format(new Date(v)) : "—";
const memory = (bytes: number | null) => bytes === null ? "—" : `${Math.round(bytes / 1024 / 1024)} MiB`;
const fresh = (s: MonitorState | null) => !!s && Date.now() - Date.parse(s.checkedAt) <= MONITOR_STALE_MS && Date.now() - Date.parse(s.checkedAt) >= -30000;
function Evidence({ cycle }: { cycle: Cycle }) {
  return <div className="np-em-evidence">
    <p>Проверка: <strong>{time(cycle.finishedAt)}</strong> · {cycle.profile === "external" ? "От външния наблюдател" : "От сървъра"}</p>
    <div className="np-em-scroll"><table><thead><tr><th>Проверка</th><th>Резултат</th><th>HTTP</th><th>Време</th><th>CF-Ray / проверка</th></tr></thead><tbody>{cycle.probes.map(p => <tr key={p.name}><th scope="row">{labels[p.name] || p.name}</th><td>{outcomes[p.outcome] || p.outcome}</td><td>{p.status ?? "—"}</td><td>{p.durationMs} ms</td><td className="np-em-id">{p.cfRay || "—"}<small>{p.probeId}</small></td></tr>)}</tbody></table></div>
    <p className="np-em-note">Началната страница и live потокът се проверяват до първия байт. Останалите проверки прочитат ограничен отговор. HTTP/2 е връзката на наблюдателя с Cloudflare.</p>
    {cycle.apache ? <div className="np-em-metrics"><span>Apache · заети <b>{cycle.apache.BusyWorkers ?? "—"}</b></span><span>Свободни <b>{cycle.apache.IdleWorkers ?? "—"}</b></span><span>Приключващи процеси <b>{cycle.apache.Stopping ?? "—"}</b></span><span>Връзки <b>{cycle.apache.ConnsTotal ?? "—"}</b></span></div> : <p className="np-em-note">За тази проверка няма Apache snapshot.</p>}
    {cycle.apps.length ? <div className="np-em-metrics">{cycle.apps.map(app => <span key={app.service}>{app.service === "web" ? "Web" : "Studio"} · {app.at ? time(app.at) : "няма данни"}<br />Активни: <b>{app.active ?? "—"}</b> · live: <b>{app.sse ?? "—"}</b> · event loop: <b>{app.eventLoopMaxMs ?? "—"} ms</b><br />Пропуснати записи: <b>{app.dropped ?? "—"}</b> · грешки при запис: <b>{app.ioFailures ?? "—"}</b></span>)}</div> : null}
    {cycle.observerHost ? <p className="np-em-note">{cycle.profile === "origin" ? "Сървър" : "Външен наблюдател"} · свободна памет: {memory(cycle.observerHost.freeBytes)} от {memory(cycle.observerHost.totalBytes)} · натоварване (1/5/15 min): {cycle.observerHost.load.join(" / ") || "—"}</p> : null}
    <details><summary>Технически данни за съпоставка</summary><pre>{JSON.stringify(cycle, null, 2)}</pre></details>
  </div>;
}

export function ErrorMonitoringDesk({ userKey }: { userKey: string }) {
  const { data, failed, loading, refresh } = useMonitoring<MonitoringView>(false);
  const [selected, select] = useState<string | null>(null), [period, setPeriod] = useState("all"), [copied, setCopied] = useState(false);
  useEffect(() => {
    const acknowledgeVisible = () => {
      if (!failed && data?.attentionAt && document.visibilityState === "visible") markMonitoringSeen(userKey, data.attentionAt);
    };
    acknowledgeVisible();
    document.addEventListener("visibilitychange", acknowledgeVisible);
    return () => document.removeEventListener("visibilitychange", acknowledgeVisible);
  }, [userKey, data?.attentionAt, failed]);
  const source = data?.sources;
  const incidents = [...(source?.origin?.incidents ?? []).map(i => ({ ...i, source: "Сървър" })), ...(source?.external?.incidents ?? []).map(i => ({ ...i, source: "Отвън" }))]
    .filter(i => period === "all" || Date.now() - Date.parse(i.lastSeenAt) <= (period === "24h" ? 86400000 : 7 * 86400000))
    .sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt));
  const issueRows = [...(source?.origin?.requestIssues ?? [])].sort((a, b) => b.at.localeCompare(a.at));
  const status = failed ? "unknown" : data?.status ?? "unknown";
  const title = loading && !data ? "Зареждане на диагностиката…" : status === "ok" ? "Последните проверки са успешни" : status === "problem" ? "Има проблем за проверка" : "Няма достатъчно актуални данни";
  const selectedIncident = incidents.find(i => i.id === selected);
  async function copy() {
    try { await navigator.clipboard.writeText(JSON.stringify(selectedIncident ?? data, null, 2)); setCopied(true); } catch { setCopied(false); }
  }
  return <div className="np-em">
    <header className="np-em-header"><div><p className="np-em-eyebrow">Сайт и инфраструктура</p><h1>Error monitoring</h1><p>Работи ли сайтът, какво е прекъснало и какви данни са запазени.</p></div><div className="np-em-actions"><button type="button" onClick={refresh}>Обнови</button></div></header>
    <section className={`np-em-status np-em-${status}`} aria-live="polite"><span className="np-em-status-icon" aria-hidden="true">{status === "ok" ? "✓" : "!"}</span><div><h2>{title}</h2><p>{failed ? "Studio не успя да получи диагностиката. Това само по себе си не доказва, че публичният сайт е спрял." : status === "unknown" ? "Наблюдател липсва, данните са остарели или записването не е потвърдено. Не приемаме липсата на данни за успешна проверка." : status === "problem" ? "Отвори последното събитие и сравни публичния достъп с вътрешните услуги." : "Потвърдено от сървърния и външния наблюдател; това не е гаранция за непрекъснат достъп от всяка мрежа."}</p><small>Екранът се обновява на 20 секунди · часове за България · {data ? `прочетено ${time(data.checkedAt)}` : "още няма прочетени данни"}</small></div></section>
    <div className="np-em-sources">{(["origin", "external"] as const).map(key => { const s = source?.[key] ?? null, current = fresh(s); return <section className="np-em-card" key={key}><div className="np-em-card-top"><h2>{key === "origin" ? "От сървъра" : "Отвън · читателски достъп"}</h2><span className={`np-em-pill ${current ? s?.latest.probes.every(p => p.outcome === "ok" && p.durationMs < 3000) ? "np-em-ok" : "np-em-problem" : "np-em-unknown"}`}>{!s ? "Няма данни" : !current ? "Остарели данни" : s.latest.probes.every(p => p.outcome === "ok" && p.durationMs < 3000) ? "Успешни проверки" : "За проверка"}</span></div><p>{key === "origin" ? "Сравнява Web, директния Studio, публичния адрес и Apache." : "Проверява публичния адрес по отделен мрежов път. Лаптопът трябва да е буден и свързан."}</p><p className="np-em-note">Последна проверка: <strong>{time(s?.checkedAt)}</strong><br />Наблюдение от: {time(s?.firstObservedAt)}</p>{s ? <details><summary>Текуща диагностика</summary><Evidence cycle={s.latest} /></details> : null}</section>; })}</div>
    <section className="np-em-card"><div className="np-em-card-top"><div><h2>Последни прекъсвания и сигнали</h2><p className="np-em-note">Запазени са до 100 събития от всеки наблюдател. Часовете показват кога проблемът и възстановяването са засечени, а не точната продължителност на прекъсването.</p></div><label>Период <select value={period} onChange={e => setPeriod(e.target.value)}><option value="all">Налична история</option><option value="24h">24 часа</option><option value="7d">7 дни</option></select></label></div>
      {incidents.length ? <div className="np-em-scroll"><table><thead><tr><th>Засечено</th><th>Събитие</th><th>Наблюдател</th><th>Последно засечено</th><th>Възстановяване / край</th><th /></tr></thead><tbody>{incidents.map(i => <tr key={i.id}><td>{time(i.startedAt)}</td><th scope="row">{kinds[i.kind]}{i.endedAt === null ? <span className="np-em-pill np-em-problem">Незатворено</span> : null}</th><td>{i.source}</td><td>{time(i.lastSeenAt)}</td><td>{i.endedAt ? time(i.endedAt) : "Няма потвърждение"}</td><td><button type="button" aria-expanded={selected === i.id} onClick={() => { select(selected === i.id ? null : i.id); setCopied(false); }}>Подробности</button></td></tr>)}</tbody></table></div> : <p className="np-em-empty">{!source?.origin && !source?.external ? "Историята още не е достъпна. Няма основание да твърдим, че не е имало прекъсвания." : "Няма събития за избрания период в наличната история."}</p>}
      {selectedIncident ? <section className="np-em-selected"><div className="np-em-card-top"><h3>{kinds[selectedIncident.kind]} · {time(selectedIncident.startedAt)}</h3><button type="button" onClick={copy}>{copied ? "Копирано" : "Копирай диагностиката"}</button></div><p className="np-em-note">{selectedIncident.kind === "observation-gap" ? "През този интервал няма достатъчно проверки. Това не доказва, че сайтът е бил недостъпен." : "Показан е последният запазен snapshot от проблемния период. Причината не се определя автоматично само по HTTP кода."}</p><Evidence cycle={selectedIncident.evidence} /></section> : null}
    </section>
    <section className="np-em-card"><h2>Грешки и бавни заявки в приложението</h2><p className="np-em-note">До 100 запазени сигнала. 5xx, бавни заявки и продължителни прекъсвания преди отговор; нормалните live връзки и отменените тестови проверки не са грешки.</p>{issueRows.length ? <div className="np-em-scroll"><table><thead><tr><th>Час</th><th>Приложение</th><th>Резултат</th><th>Група</th><th>Време</th><th>CF-Ray / ID</th></tr></thead><tbody>{issueRows.map(i => <tr key={i.id + i.event}><td>{time(i.at)}</td><td>{i.service}</td><td>{i.event === "slow" ? "Бавна заявка" : i.event === "aborted" ? "Прекъсната преди отговор" : `HTTP ${i.status}`}</td><td>{i.method} · {i.route}</td><td>{i.durationMs} ms</td><td className="np-em-id">{i.cfRay ?? "—"}<small>{i.id}</small></td></tr>)}</tbody></table></div> : <p className="np-em-empty">Няма запазени сигнали в достъпната история.</p>}</section>
    <p className="np-em-note">Ако Studio също е недостъпно, новият знак в менюто ще може да се покаже при възстановена връзка. При вече отворено Studio неуспешната проверка показва липса на връзка с диагностиката. Екранът не рестартира услуги и не изпраща нищо до поддръжката.</p>
  </div>;
}
