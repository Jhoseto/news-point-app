"use client";
import Link from "next/link";
import type { AgendaEvent } from "@/lib/city-guide/event-agenda";
import { eventSaveKey } from "@/lib/city-guide/saved-events";
import { useCitySaved } from "./use-city-saved";
import "./city-mobile.css";

export function CitySavedEvents({ events }: { events: (AgendaEvent & { category: "culture" | "nightlife" })[] }) {
  const { saved, ready, error, toggle } = useCitySaved();
  const visible = events.filter(event => saved.includes(eventSaveKey(event.category, event.id)));
  return <section className="city-saved" aria-labelledby="city-saved-title"><header><span>ТВОЯТ ЛИЧЕН АФИШ</span><h1 id="city-saved-title">За <em>по-късно.</em></h1><p>Избраните от теб събития. Запазени само на това устройство.</p></header><p role="status">{!ready ? "Зареждане на запазените…" : error || (!visible.length ? "Още няма запазени събития в актуалния афиш." : `${visible.length} в актуалния афиш`)}</p>{ready && saved.length > visible.length ? <p>Приключилите и временно недостъпните събития не се показват.</p> : null}<div className="city-saved-grid">{visible.map(event => <article key={eventSaveKey(event.category, event.id)}><Link href={`/moyat-plovdiv/${event.category}/#event-${encodeURIComponent(event.id)}`}>{event.image ? <img src={event.image} alt="" loading="lazy" /> : null}<div><time dateTime={event.date}>{new Date(`${event.date}T12:00:00Z`).toLocaleDateString("bg-BG", { day: "numeric", month: "long" })} · {event.time}</time><h2>{event.title}</h2><p>{event.place}</p></div></Link><button onClick={() => toggle(eventSaveKey(event.category, event.id))} aria-label={`Премахни ${event.title} от запазените`}>Премахни</button></article>)}</div><Link className="city-saved-explore" href="/moyat-plovdiv/culture/">Открий събития ↗</Link></section>;
}
