import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { JsonLd } from "@/components/json-ld";
import { breadcrumbList } from "@/lib/jsonld";
import { publicMetadata, SITE_OG_IMAGE } from "@/lib/public-metadata";
import { publicRobotsMetadata } from "@/lib/indexing-policy.mjs";
import { shareOrigin } from "@/lib/share-card";
import { AGENDA_KINDS } from "@/lib/city-guide/event-agenda";
import { cityEventSchema } from "@/lib/city-guide/event-page";
import { loadCityEventPage } from "@/lib/city-guide/event-page-server";
import "@/components/city-guide/city-event-page.css";

type Props = { params: Promise<{ id: string }> };
const dateLabel = (value: string) => new Intl.DateTimeFormat("bg-BG", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Sofia" }).format(new Date(`${value}T12:00:00Z`));
const checkedLabel = (value: string) => new Intl.DateTimeFormat("bg-BG", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Sofia" }).format(new Date(value));
const statusNames: Record<string, string> = { EventCancelled: "Отменено", EventPostponed: "Отложено", EventRescheduled: "Променена дата" };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const page = await loadCityEventPage((await params).id);
  if (!page) notFound();
  const { event } = page;
  return { ...publicMetadata({ path: page.path, title: `${event.title} — Пловдив`,
    description: `${event.title} — ${event.recurrence || dateLabel(event.date)}${event.time ? `, ${event.time}` : ""}, ${event.place}. Програма и подробности в Моят Пловдив.`,
    imagePath: SITE_OG_IMAGE }), robots: publicRobotsMetadata() };
}

export default async function CityEventDetailPage({ params }: Props) {
  const page = await loadCityEventPage((await params).id);
  if (!page) notFound();
  const { event, sourceName, checkedAt, category } = page;
  const categoryTitle = category === "culture" ? "Култура и събития" : "Нощен Пловдив";
  const categoryPath = `/moyat-plovdiv/${category}/`;
  const origin = shareOrigin(), url = `${origin}${page.path}`;
  const schema = cityEventSchema(event, url);
  const description = event.description || `${event.title} — ${event.place}, ${dateLabel(event.date)}.`;
  return <article className="city-event-page">
    <JsonLd id="np-ld-city-event" data={[
      { "@type": "WebPage", "@id": `${url}#webpage`, url, name: event.title, description, inLanguage: "bg", isPartOf: { "@id": `${origin}/moyat-plovdiv/` }, ...(schema ? { mainEntity: { "@id": `${url}#event` } } : {}) },
      breadcrumbList(origin, [{ name: "Начало", path: "/" }, { name: "Моят Пловдив", path: "/moyat-plovdiv/" }, { name: categoryTitle, path: categoryPath }, { name: event.title, path: page.path }]),
      ...(schema ? [schema] : []),
    ]} />
    <nav className="city-event-breadcrumb" aria-label="Навигационна пътека"><Link href="/moyat-plovdiv/">Моят Пловдив</Link><span aria-hidden="true">/</span><Link href={categoryPath}>{categoryTitle}</Link></nav>
    <header><p className="city-event-kind">{AGENDA_KINDS[event.kind]} · Пловдив</p><h1>{event.title}</h1>{statusNames[event.status] ? <p className="city-event-status">{statusNames[event.status]}</p> : null}</header>
    <div className="city-event-layout">
      {event.image ? <img className="city-event-image" src={event.image} alt={event.title} decoding="async" /> : null}
      <div className="city-event-facts"><dl>
        <div><dt>Кога</dt><dd>{event.recurrence || <time dateTime={event.date}>{dateLabel(event.date)}</time>}{!event.recurrence && event.endDate !== event.date ? <> — <time dateTime={event.endDate}>{dateLabel(event.endDate)}</time></> : null}{event.time && !event.doorsTime ? ` · ${event.time}` : ""}{event.doorsTime ? <small>Врати: {event.doorsTime}</small> : null}{event.performanceTime ? <small>Начало: {event.performanceTime}</small> : null}</dd></div>
        <div><dt>Къде</dt><dd>{event.place}{event.address ? <small>{event.address}</small> : null}</dd></div>
        {event.price !== null ? <div><dt>Обявена цена</dt><dd>{event.price} €</dd></div> : null}
      </dl><p className="city-event-source">По програмата на {sourceName}. <time dateTime={checkedAt}>Данни, получени на {checkedLabel(checkedAt)}</time>.</p><p className="city-event-note">Програмата може да се промени. Наличността на места не се проследява в тази справка.</p><Link className="city-event-back" href={categoryPath}>Виж целия афиш →</Link></div>
    </div>
    {event.description ? <section className="city-event-description" aria-labelledby="city-event-description-title"><h2 id="city-event-description-title">За събитието</h2>{event.description.split(/\n{2,}/u).map((paragraph, index) => <p key={index}>{paragraph}</p>)}</section> : null}
  </article>;
}
