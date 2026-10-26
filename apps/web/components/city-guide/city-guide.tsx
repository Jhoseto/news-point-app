"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { CITY_CATEGORIES, type CityCategory } from "@/lib/city-guide/catalog";
import { cityReaderTopicLabel } from "@/lib/city-guide/presentation";
import { type CityStory } from "@/lib/city-guide/news";
import { CityRelatedNews } from "./city-related-news";
import "./city-home.css";
import { ArticleImage } from "@/components/ui";
import "./city-guide.css";
import "./city-workspace.css";

const ROOT = "/moyat-plovdiv";
const storyDate = new Intl.DateTimeFormat("bg-BG", { day: "numeric", month: "long", year: "numeric" });
function useCityReveals() {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = root.current;
    if (!node || typeof IntersectionObserver === "undefined" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) if (entry.isIntersecting) {
        entry.target.classList.add("city-in-view");
        observer.unobserve(entry.target);
      }
    }, { threshold: 0.08, rootMargin: "160px 0px 160px 0px" });
    const observeTargets = () => node.querySelectorAll<HTMLElement>("[data-city-reveal]:not(.city-in-view)").forEach(target => observer.observe(target));
    observeTargets();
    const mutations = new MutationObserver(observeTargets);
    mutations.observe(node, { childList: true, subtree: true });
    node.classList.add("city-motion-ready");
    return () => { mutations.disconnect(); observer.disconnect(); };
  }, []);
  return root;
}

function CityNewsRail({ stories, title }: { stories: CityStory[]; title: string }) {
  return <CityRelatedNews stories={stories} topic={title} />;
}

function CityPhotoAccordion({ categories, stories, query, activeTopicsByCategory, topicHrefByCategory }: { categories: CityCategory[]; stories: Record<string, CityStory | null>; query: string; activeTopicsByCategory: Record<string, string[]>; topicHrefByCategory: Record<string, Record<string, string>> }) {
  const [openSlug, setOpenSlug] = useState<string | null>(null);
  const [hoverReady, setHoverReady] = useState(false);
  const lastPointer = useRef<{ x: number; y: number } | null>(null);
  return <div className={`city-photo-accordion${hoverReady ? " city-photo-hover-ready" : ""}`} onPointerMove={event => {
    if (event.pointerType !== "mouse") return;
    const previous = lastPointer.current;
    if (previous && Math.hypot(event.clientX - previous.x, event.clientY - previous.y) > 2) setHoverReady(true);
    lastPointer.current = { x: event.clientX, y: event.clientY };
  }} onPointerLeave={() => { lastPointer.current = null; setHoverReady(false); }}>
    {categories.map(category => {
      const story = stories[category.slug] ?? null;
      const activeTopics = category.topics.filter(topic => activeTopicsByCategory[category.slug]?.includes(topic.title));
      const matches = query ? activeTopics.filter(topic => matchesCityQuery(`${topic.title} ${topic.detail}`, query)) : activeTopics;
      const topics = matches.length ? matches : activeTopics;
      const expanded = openSlug === category.slug;
      const detailsId = `city-photo-details-${category.slug}`;
      return <article id={`category-${category.slug}`} className={`city-photo-panel city-accent-${category.accent}${expanded ? " is-active" : ""}`} key={category.slug}>
        <span className="city-photo-panel-media" aria-hidden="true">{category.slug === "nightlife" ? <img src="/brand/plovdiv-night-kamburov.jpg" alt="" loading="lazy" decoding="async" /> : ["transport", "environment"].includes(category.slug) ? <img src="/brand/plovdiv-aerial.webp" alt="" decoding="async" /> : category.slug === "education" ? <img src="/brand/plovdiv-school-public-domain.webp" alt="" loading="lazy" decoding="async" /> : category.slug === "culture" ? <img src="/brand/plovdiv-theatre-public-domain.webp" alt="" loading="lazy" decoding="async" /> : story?.hero ? <ArticleImage media={{ ...story.hero, alt: "" }} sizes="(min-width: 900px) 600px, 80vw" className="city-photo-panel-image" /> : <span className="city-photo-panel-graphic"><CityMark slug={category.slug} /></span>}</span>
        <span className="city-photo-panel-shade" aria-hidden="true" />
        <button type="button" className="city-photo-panel-trigger" aria-expanded={expanded} aria-controls={detailsId} aria-label={`${expanded ? "Скрий" : "Покажи"} темите за ${category.title}`} onClick={event => {
          const closing = openSlug === category.slug;
          setOpenSlug(closing ? null : category.slug);
          if (closing) setHoverReady(false);
          if (window.matchMedia("(max-width: 1350px)").matches) event.currentTarget.parentElement?.scrollIntoView({ inline: "center", block: "nearest", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
        }} />
        <div className="city-photo-panel-content">
          <div className="city-photo-panel-label"><small>{category.eyebrow}</small><h2>{category.title}</h2></div>
          <div className="city-photo-panel-details" id={detailsId}>
            <p>{category.lead}</p>
            <div className="city-photo-panel-topics" aria-label={`Теми в ${category.title}`}>{topics.slice(0, 3).map(topic => <Link key={topic.title} href={`${ROOT}/${category.slug}/${topicHrefByCategory[category.slug]?.[topic.title] ?? ""}`}>{cityReaderTopicLabel(topic.title)} <Arrow diagonal /></Link>)}</div>
            <div className="city-photo-panel-bottom"><Link href={`${ROOT}/${category.slug}/`} className="city-photo-panel-all" aria-label={`${activeTopics.length} справки с данни в ${category.title}`}>Всички {activeTopics.length} теми <Arrow /></Link></div>
          </div>
        </div>
      </article>;
    })}
  </div>;
}

function matchesCityQuery(text: string, query: string) {
  const haystack = text.toLocaleLowerCase("bg");
  return haystack.includes(query) || (query.length >= 5 && haystack.includes(query.slice(0, -1)));
}

function Arrow({ diagonal = false }: { diagonal?: boolean }) {
  return <span aria-hidden="true" className="city-arrow">{diagonal ? "↗" : "→"}</span>;
}

function CityMark({ slug }: { slug: string }) {
  const paths: Record<string, React.ReactNode> = {
    transport: <><path d="M5 18V8c0-2 2-4 4-4h6c2 0 4 2 4 4v10M5 13h14M8 18h.01M16 18h.01M8 4l-1 9m9-9 1 9" /><path d="M7 19v2m10-2v2" /></>,
    parking: <><path d="M7 20V4h6a5 5 0 0 1 0 10H7" /><path d="M7 14h6" /></>,
    outages: <path d="m13 2-8 11h6l-1 9 9-12h-6l0-8Z" />,
    municipality: <><path d="M3 10h18L12 3 3 10Zm2 0v10m5-10v10m4-10v10m5-10v10M3 21h18" /></>,
    education: <><path d="m2 9 10-5 10 5-10 5L2 9Zm4 3v5c4 3 8 3 12 0v-5M22 9v7" /></>,
    environment: <><path d="M20 4C9 3 4 9 5 16c6 2 14-1 15-12ZM5 20c3-6 7-9 12-11" /></>,
    culture: <><path d="M4 5h16v14H4zM8 5v14m8-14v14M4 9h4m-4 6h4m8-6h4m-4 6h4" /></>,
    adopt: <><path d="M12 20c-3-2-8-4-8-8a4 4 0 0 1 4-4c2 0 3 1 4 2 1-1 2-2 4-2a4 4 0 0 1 4 4c0 4-5 6-8 8Z" /><path d="M6 5h.01M10 3h.01M14 3h.01M18 5h.01" /></>,
    nightlife: <><path d="M19 15.5A8 8 0 0 1 8.5 5a8 8 0 1 0 10.5 10.5Z" /><path d="m17 4 .5 1.5L19 6l-1.5.5L17 8l-.5-1.5L15 6l1.5-.5L17 4Z" /></>,
  };
  return <svg className="city-mark" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[slug]}</svg>;
}


export function CityGuideHome({ newsByCategory, featuredStories, today, availableSlugs, activeTopicsByCategory, topicHrefByCategory }: { newsByCategory: Record<string, CityStory | null>; featuredStories: CityStory[]; today?: React.ReactNode; availableSlugs: string[]; activeTopicsByCategory: Record<string, string[]>; topicHrefByCategory: Record<string, Record<string, string>> }) {
  const motionRoot = useCityReveals();
  const searchRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const normalized = query.trim().toLocaleLowerCase("bg");
  const available = useMemo(() => CITY_CATEGORIES.filter(category => availableSlugs.includes(category.slug)), [availableSlugs]);
  const visible = useMemo(() => available.filter(category => {
    if (!normalized) return true;
    return matchesCityQuery(`${category.title} ${category.lead} ${category.topics.filter(topic => activeTopicsByCategory[category.slug]?.includes(topic.title)).map(topic => `${topic.title} ${topic.detail}`).join(" ")}`, normalized);
  }), [normalized, available, activeTopicsByCategory]);

  return <div className="city-page city-home-page" ref={motionRoot}>
    <div className="np-container city-container">
      <section id="temi" className="city-directory" aria-labelledby="city-topics-title">
        <div className="city-home-masthead"><div className="city-home-header"><h1 id="city-topics-title">Моят <em>Пловдив.</em></h1><p>Намери нужното. Избери къде да отидеш.</p></div>
        <div className="city-toolbar"><label className="city-search"><span aria-hidden="true">⌕</span><span className="sr-only">Търси тема</span><input ref={searchRef} type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Търси например автобус, градина, театър..." /></label><span className="city-result-count" aria-live="polite">{visible.length} {visible.length === 1 ? "област" : "области"}</span></div></div>
        {visible.length ? <CityPhotoAccordion categories={visible} stories={newsByCategory} query={normalized} activeTopicsByCategory={activeTopicsByCategory} topicHrefByCategory={topicHrefByCategory} /> : <div className="city-empty"><strong>Няма справка с данни за това търсене.</strong><p>Опитай друга дума.</p><button type="button" onClick={() => { setQuery(""); searchRef.current?.focus(); }}>Покажи наличните справки <Arrow /></button></div>}
        <p className="city-photo-credit">Нощна снимка: Kostadin Kamburov / CC BY-SA 4.0</p>
      </section>
      {!normalized ? today : null}
      {!normalized && featuredStories.length ? <div className="city-home-news"><CityNewsRail stories={featuredStories} title="Градът в новините" /></div> : null}

    </div>
  </div>;
}

export function CityCategoryView({ category, stories, observations }: { category: CityCategory; stories: Record<string, CityStory | null>; observations?: React.ReactNode }) {
  const motionRoot = useCityReveals();
  const related = [...new Map(Object.values(stories).filter((story): story is CityStory => !!story).map(story => [story.path, story])).values()].slice(0, 3);
  const intro: Record<string, string> = {
    municipality: "Предстоящи срокове, отворени обсъждания и условия за кандидатстване. Избери какво те интересува.",
    education: "Срокове за кандидатстване и записване, свободни места в градини, ясли и първи клас.",
    environment: "Показания за въздуха, мобилни пунктове и места за разделно събиране.",
    culture: "Планирай следващото излизане — театър, опера и изложби с конкретни дати и места.",
    adopt: "Запознай се с животните и прочети как протича осиновяването.",
  };
  const photo = category.slug === "education" ? "/brand/plovdiv-school-public-domain.webp" : category.slug === "culture" ? "/brand/plovdiv-theatre-public-domain.webp" : "/brand/plovdiv-aerial.webp";
  return <div className={`city-page city-info-page city-info-${category.slug} city-accent-${category.accent}`} ref={motionRoot}><div className="np-container city-container">
    <nav className="city-breadcrumb" aria-label="Навигационна пътека"><Link href="/">Начало</Link><span>/</span><Link href={`${ROOT}/`}>Моят Пловдив</Link><span>/</span><span aria-current="page">{category.title}</span></nav>
    <header className="city-editorial-hero"><img src={photo} alt="" decoding="async" /><div className="city-editorial-hero-copy"><span>МОЯТ ПЛОВДИВ / {category.eyebrow.toLocaleUpperCase("bg")}</span><h1>{category.title}</h1><p>{intro[category.slug] ?? category.lead}</p><a href="#city-observed-title">Намери нужната информация <Arrow /></a></div><span className="city-editorial-hero-label">ПЛОВДИВ / ТВОЯТ ГРАД</span></header>
    {observations}
  </div></div>;
}

export function CityTransportView({ category, stories, observations, activeTopics = [], hasFareData = false, hasRouteData = false }: { category: CityCategory; stories: Record<string, CityStory | null>; observations?: React.ReactNode; activeTopics?: string[]; hasFareData?: boolean; hasRouteData?: boolean }) {
  const motionRoot = useCityReveals();
  const related = activeTopics.flatMap(title => stories[title] ? [stories[title]!] : []).slice(0, 3);
  return <div className="city-page city-transport-page city-accent-blue" ref={motionRoot}><div className="np-container city-container">
    <nav className="city-breadcrumb" aria-label="Навигационна пътека"><Link href="/">Начало</Link><span>/</span><Link href={ROOT + "/"}>Моят Пловдив</Link><span>/</span><span aria-current="page">{category.title}</span></nav>
    <header className="city-transport-hero" data-city-reveal><div className="city-transport-hero-copy"><p className="city-eyebrow">МОЯТ ПЛОВДИВ / 01</p><h1>Транспорт <em>и движение.</em></h1><p>Автобусни линии и посоки, билети и карти, полети от и до Пловдив.</p><a href={hasRouteData ? "#nablyudavani-plovdiv-livetransport-gtfs" : hasFareData ? "#nablyudavani-plovdiv-transit" : "#city-observed-title"}>Към справките <Arrow /></a></div><div className="city-transport-hero-photo" role="img" aria-label="Снимка от въздуха на Пловдив"><span>ПЛОВДИВ / В ДВИЖЕНИЕ</span></div></header>
    <div className="city-transport-note" role="note"><span aria-hidden="true">✳</span><p>{hasRouteData ? "Избери линия, посока и спирка за планираните часове днес. Разписанието не отчита закъснения или временни отклонения." : hasFareData ? "Виж цените на билетите и картите за градския транспорт." : "Избери транспортна справка."}</p></div>
    {observations}
  </div></div>;
}

export function CityParkingView({ category, stories, observations, hasObservedData = false }: { category: CityCategory; stories: Record<string, CityStory | null>; observations?: React.ReactNode; hasObservedData?: boolean }) {
  const motionRoot = useCityReveals();
  const related = category.topics.flatMap(topic => stories[topic.title] ? [stories[topic.title]!] : []).slice(0, 3);
  return <div className="city-page city-parking-page city-accent-cyan" ref={motionRoot}><div className="np-container city-container">
    <nav className="city-breadcrumb" aria-label="Навигационна пътека"><Link href="/">Начало</Link><span>/</span><Link href={`${ROOT}/`}>Моят Пловдив</Link><span>/</span><span aria-current="page">{category.title}</span></nav>
    <header className="city-parking-hero" data-city-reveal><div className="city-parking-hero-copy"><p className="city-eyebrow">МОЯТ ПЛОВДИВ / 02</p><h1>Паркиране<span>.</span></h1><p>Зони, конкретни паркинги, цени и работно време — на едно място.</p><a href="#city-observed-title">Към справките <Arrow /></a></div><div className="city-parking-hero-photo" role="img" aria-label="Изглед от въздуха към Пловдив"><div className="city-parking-photo-frame"><span>ГРАДСКИ ОРИЕНТИР / ПЛОВДИВ</span><strong aria-hidden="true">P</strong><span>02 / НА МЯСТО</span></div></div></header>
    <div className="city-parking-status" role="note"><span aria-hidden="true">✳</span><p>{hasObservedData ? "Виж кога се плаща за паркиране, каква е цената и как да платиш." : "Правила за зоните и помощ при репатриран автомобил."}</p></div>
    {observations}
  </div></div>;
}

export function CityOutagesView({ category, stories, observations }: { category: CityCategory; stories: Record<string, CityStory | null>; observations?: React.ReactNode }) {
  const motionRoot = useCityReveals();
  const related = category.topics.flatMap(topic => stories[topic.title] ? [stories[topic.title]!] : []).slice(0, 3);
  return <div className="city-page city-outages-page city-accent-indigo" ref={motionRoot}><div className="np-container city-container">
    <nav className="city-breadcrumb" aria-label="Навигационна пътека"><Link href="/">Начало</Link><span>/</span><Link href={`${ROOT}/`}>Моят Пловдив</Link><span>/</span><span aria-current="page">{category.title}</span></nav>
    <header className="city-outages-header" data-city-reveal>
      <div className="city-outages-heading"><p className="city-eyebrow">МОЯТ ПЛОВДИВ / 03</p><h1>Аварии <em>и ремонти.</em></h1><p>Проверените справки за прекъсвания в Пловдив — с час на последната проверка.</p></div>
      <div className="city-outages-notice" role="note"><span aria-hidden="true">✳</span><div><strong>Засегнати адреси и очаквано възстановяване.</strong><p>Часът за възстановяване е ориентировъчен и може да се промени.</p></div></div>
    </header>
    {observations}
  </div></div>;
}

