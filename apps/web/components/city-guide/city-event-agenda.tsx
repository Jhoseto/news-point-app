"use client";

import Link from "next/link";
import { CityRelatedNews } from "./city-related-news";
import { useEffect, useRef, useState } from "react";
import { ArticleImage } from "@/components/ui";
import { AGENDA_KINDS, AGENDA_EXTRA_FILTERS, agendaExtraMatches, agendaPeriodMatches, type AgendaEvent, type AgendaKind, type AgendaExtra } from "@/lib/city-guide/event-agenda";
import type { CityStory } from "@/lib/city-guide/news";
import "./city-event-agenda.css";

function dateLabel(date: string, long = false) {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("bg-BG", { day: "numeric", month: long ? "long" : "short", ...(long || Number(date.slice(0, 4)) !== new Date().getFullYear() ? { year: "numeric" } : {}) });
}
function eventClock(event: AgendaEvent) {
  return event.performanceTime ? `${event.performanceTime} начало` : event.time ? `${event.time}${event.doorsTime === event.time ? " врати" : ""}` : "";
}
function eventStatus(event: AgendaEvent) {
  return ({ EventCancelled: "Отменено", EventPostponed: "Отложено", EventRescheduled: "Променена дата" } as Record<string, string>)[event.status] ?? "";
}
function EventPhoto({ event, eager = false }: { event: AgendaEvent; eager?: boolean }) {
  return event.image ? <div className="agenda-photo"><img src={event.image} alt="" aria-hidden="true" className="agenda-photo-ambience" loading={eager ? "eager" : "lazy"} /><img src={event.image} alt={event.title} className="agenda-photo-main" loading={eager ? "eager" : "lazy"} /></div>
    : <div className="agenda-photo agenda-photo-missing"><span>{AGENDA_KINDS[event.kind]}</span><strong>{event.title}</strong></div>;
}

export function CityEventAgenda({ category, events, news, today }: { category: "culture" | "nightlife"; events: AgendaEvent[]; news: Record<string, CityStory[]>; today: string }) {
  const [kind, setKind] = useState<AgendaKind | "all">("all");
  const [period, setPeriod] = useState("all"), [query, setQuery] = useState(""), [limit, setLimit] = useState(12);
  const [place, setPlace] = useState("all");
  const [extra, setExtra] = useState("all");
  const extras = (Object.keys(AGENDA_EXTRA_FILTERS) as AgendaExtra[]).filter(key => events.some(event => agendaExtraMatches(event, key)));
  const places = [...new Set(events.map(event => event.place))].sort((a, b) => a.localeCompare(b, "bg"));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = events.find(event => event.id === selectedId) ?? null;
  const setSelected = (event: AgendaEvent | null) => setSelectedId(event?.id ?? null);
  const dialog = useRef<HTMLDialogElement>(null);
  const openedBookmark = useRef("");
  const kinds = (Object.keys(AGENDA_KINDS) as AgendaKind[]).filter(key => events.some(event => event.kind === key));
  useEffect(() => {
    const change = () => {
      const hash = window.location.hash;
      if (hash.startsWith("#event-")) {
        if (openedBookmark.current === hash) return;
        openedBookmark.current = hash;
        try { const event = events.find(entry => entry.id === decodeURIComponent(hash.slice(7))); if (event) setSelected(event); } catch { /* Ignore a malformed bookmark. */ }
        return;
      }
      openedBookmark.current = "";
      if (hash.startsWith("#agenda-extra-")) {
        const value = hash.slice("#agenda-extra-".length);
        if (Object.hasOwn(AGENDA_EXTRA_FILTERS, value)) { setExtra(value); setKind("all"); setLimit(12); }
        return;
      }
      const legacy: Record<string, AgendaKind> = { "#nablyudavani-plovdiv-theatre": "theatre", "#nablyudavani-plovdiv-opera": "opera", "#nablyudavani-plovdiv-gallery-current": "exhibition", "#nablyudavani-plovdiv-youth-centre": "community" };
      const key = legacy[hash] ?? hash.replace("#agenda-", "");
      if (key === "all" || Object.hasOwn(AGENDA_KINDS, key)) { setKind(key as AgendaKind | "all"); setLimit(12); }
    };
    change(); window.addEventListener("hashchange", change); return () => window.removeEventListener("hashchange", change);
  }, [events]);
  useEffect(() => { if (selected) dialog.current?.showModal(); else dialog.current?.close(); }, [selected]);
  const filtered = events.filter(event => (place === "all" || event.place === place) && (kind === "all" || kind === event.kind) && agendaExtraMatches(event, extra) && agendaPeriodMatches(event, period, today) && `${event.title} ${event.place}`.toLocaleLowerCase("bg").includes(query.toLocaleLowerCase("bg")));
  const lead = filtered[0];
  const contextual = news[place !== "all" ? `place:${place}:${kind}` : kind] ?? [];
  const queryWords = query.trim().toLocaleLowerCase("bg").split(/\s+/u).filter(Boolean);
  const stories = filtered.length ? contextual.filter(story => agendaExtraMatches({ title: story.title, price: null }, extra) && queryWords.every(word => story.title.toLocaleLowerCase("bg").includes(word))) : [];
  const eventStories = selected ? news[`event:${selected.id}`] ?? [] : [];
  const chooseKind = (value: AgendaKind | "all") => { setKind(value); setLimit(12); };
  return <div className={`city-agenda city-agenda-${category}`}>
    <header className="agenda-heading"><div><p className="agenda-kicker">МОЯТ ПЛОВДИВ / {category === "nightlife" ? "СЛЕД ЗАЛЕЗ" : "НА СЦЕНА И ИЗВЪН НЕЯ"}</p><h1>{category === "nightlife" ? <>Нощен <em>Пловдив.</em></> : <>Култура <em>и събития.</em></>}</h1><p>{category === "nightlife" ? "Твоят следващ концерт. Твоята следваща вечер." : "Избери представление, открий изложба, запази време за себе си."}</p></div><Link className="agenda-sibling" href={`/moyat-plovdiv/${category === "nightlife" ? "culture" : "nightlife"}/`}>{category === "nightlife" ? "Културният афиш" : "След залез: Нощен Пловдив"}<span aria-hidden="true">↗</span></Link></header>
    <section className="agenda-controls" aria-label="Избор на събития" id="city-agenda-title">
      <div className="agenda-tabs"><button onClick={() => chooseKind("all")} aria-pressed={kind === "all"}>Всички <span>{events.length}</span></button>{kinds.map(key => <button id={`agenda-${key}`} key={key} aria-pressed={kind === key} onClick={() => chooseKind(key)}>{AGENDA_KINDS[key]} <span>{events.filter(event => event.kind === key).length}</span></button>)}</div>
      <div className="agenda-tools"><div className="agenda-periods">{[["all", "Всички дати"], ["today", "Днес"], ["weekend", "Уикенд"], ["week", "7 дни"]].map(([value, label]) => <button key={value} aria-pressed={period === value} onClick={() => { setPeriod(value!); setLimit(12); }}>{label}</button>)}</div>{places.length > 1 ? <label className="agenda-place"><span>Място</span><select aria-label="Избери място" value={place} onChange={event => { setPlace(event.target.value); setLimit(12); }}><option value="all">Всички места ({places.length})</option>{places.map(venue => <option key={venue}>{venue}</option>)}</select></label> : null}{extras.length ? <label className="agenda-place"><span>Интерес</span><select aria-label="Избери интерес" value={extra} onChange={event => { setExtra(event.target.value); setLimit(12); }}><option value="all">Всички интереси</option>{extras.map(key => <option key={key} value={key}>{AGENDA_EXTRA_FILTERS[key]}</option>)}</select></label> : null}<label className="agenda-search"><span aria-hidden="true">⌕</span><input type="search" aria-label="Търси събитие или място" placeholder="Събитие или място…" value={query} onChange={event => { setQuery(event.target.value); setLimit(12); }} /></label></div>
    </section>
    <div className={`agenda-layout ${stories.length >= 3 ? "agenda-has-news" : ""}`}><section aria-label="Афиш" className="agenda-programme">
      {lead ? <button key={lead.id} className="agenda-lead" onClick={() => setSelected(lead)}><EventPhoto event={lead} eager /><div className="agenda-lead-copy"><span className="agenda-kicker">{AGENDA_KINDS[lead.kind]}</span><div className="agenda-date">{lead.recurrence || dateLabel(lead.date)}{lead.kind === "exhibition" ? ` — ${dateLabel(lead.endDate)}` : eventClock(lead) ? ` / ${eventClock(lead)}` : ""}</div><h2>{lead.title}</h2><p>{lead.place}</p>{eventStatus(lead) ? <strong className="agenda-status">{eventStatus(lead)}</strong> : null}<span className="agenda-open">Разгледай събитието <span aria-hidden="true">↗</span></span></div></button> : <div className="agenda-empty"><h2>{events.length ? "Няма събития за този избор." : "Афишът временно не е достъпен."}</h2>{!events.length ? <p>Опитай отново след малко.</p> : null}<button onClick={() => { setKind("all"); setPeriod("all"); setQuery(""); setPlace("all"); setExtra("all"); }}>Покажи целия афиш</button></div>}
      {filtered.length > 1 ? <><div className="agenda-section-title"><h2>Още в програмата</h2><span>{filtered.length - 1} {filtered.length === 2 ? "събитие" : "събития"}</span></div><div className="agenda-grid">{filtered.slice(1, limit).map((event, index) => <button className="agenda-card" style={{ animationDelay: `${Math.min(index, 5) * 40}ms` }} key={event.id} onClick={() => setSelected(event)}><div className="agenda-card-media"><EventPhoto event={event} /><span className="agenda-date-chip">{event.recurrence || (event.kind === "exhibition" ? `До ${dateLabel(event.endDate)}` : dateLabel(event.date))}</span>{eventStatus(event) ? <span className="agenda-status">{eventStatus(event)}</span> : null}</div><div className="agenda-card-copy"><span className="agenda-kicker">{AGENDA_KINDS[event.kind]}{eventClock(event) ? ` / ${eventClock(event)}` : ""}</span><h3>{event.title}</h3><p>{event.place}{event.kind === "exhibition" ? ` · до ${dateLabel(event.endDate)}` : ""}</p><span className="agenda-card-arrow" aria-hidden="true">↗</span></div></button>)}</div></> : null}
      {filtered.length > limit ? <button className="agenda-more" onClick={() => setLimit(value => value + 12)}>Още събития <span>↓</span></button> : null}
    </section>
    {stories.length ? <div className="agenda-news"><CityRelatedNews stories={stories} compact={stories.length >= 3} topic={place !== "all" ? place : kind === "all" ? "Истории от сцената" : AGENDA_KINDS[kind]} /></div> : null}</div>
    <dialog ref={dialog} className="agenda-dialog" onCancel={() => setSelected(null)} onClose={() => setSelected(null)} onClick={event => { if (event.target === event.currentTarget) setSelected(null); }} aria-labelledby="agenda-detail-title">{selected ? <><button className="agenda-dialog-close" aria-label="Затвори събитието" onClick={() => setSelected(null)}>×</button><EventPhoto event={selected} eager /><div className="agenda-detail"><span className="agenda-kicker">{AGENDA_KINDS[selected.kind]}</span><h2 id="agenda-detail-title">{selected.title}</h2>{eventStatus(selected) ? <p className="agenda-status">{eventStatus(selected)}</p> : null}<dl><div><dt>Кога</dt><dd>{selected.recurrence || dateLabel(selected.date, true)}{selected.endDate !== selected.date ? ` — ${dateLabel(selected.endDate, true)}` : ""}{selected.time && !selected.doorsTime ? ` · ${selected.time}` : ""}{selected.doorsTime ? <small>Врати: {selected.doorsTime}</small> : null}{selected.performanceTime ? <small>Начало: {selected.performanceTime}</small> : null}{selected.recurrence ? <small>Седмична програма · провери за промени преди посещение.</small> : null}</dd></div><div><dt>Къде</dt><dd>{selected.place}{selected.address ? <small>{selected.address}</small> : null}</dd></div>{selected.price !== null ? <div><dt>Обявена цена</dt><dd>{selected.price} €</dd></div> : null}</dl>{selected.description ? <div className="agenda-description"><h3>За вечерта</h3><p>{selected.description}</p></div> : null}<CityRelatedNews stories={eventStories} topic="Още за това събитие" /></div></> : null}</dialog>
  </div>;
}
