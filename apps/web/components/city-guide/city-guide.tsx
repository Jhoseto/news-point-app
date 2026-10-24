"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { CITY_CATEGORIES, OUT_TOPICS, type CityCategory, type CityTopic, cityTopicId } from "@/lib/city-guide/catalog";
import { cityNewsUrl, type CityStory } from "@/lib/city-guide/news";
import { ArticleImage } from "@/components/ui";
import "./city-guide.css";

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
  return <aside className="city-news-rail" aria-label={title}><div className="city-news-rail-head"><span>NEWSPOINT / КОНТЕКСТ</span><h2>{title}</h2><p>Новините допълват справките и се подбират отново при обновяване на публикациите.</p></div><div className="city-news-rail-list">{stories.map(story => <Link key={story.path} href={story.path} prefetch={false} className="city-news-rail-story"><span className="city-news-rail-photo"><ArticleImage media={story.hero ? { ...story.hero, alt: "" } : null} sizes="96px" className="city-news-rail-image" /></span><span className="city-news-rail-copy"><time dateTime={story.publishedAt}>{storyDate.format(new Date(story.publishedAt))}</time><strong>{story.title}</strong></span><Arrow diagonal /></Link>)}</div><Link href="/plovdiv/" className="city-news-rail-more">Всички новини от Пловдив <Arrow diagonal /></Link></aside>;
}

function CityPhotoAccordion({ categories, stories, query }: { categories: CityCategory[]; stories: Record<string, CityStory | null>; query: string }) {
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
      const matches = query ? category.topics.filter(topic => matchesCityQuery(`${topic.title} ${topic.detail}`, query)) : category.topics;
      const topics = matches.length ? matches : category.topics;
      const expanded = openSlug === category.slug;
      const detailsId = `city-photo-details-${category.slug}`;
      return <article id={`category-${category.slug}`} className={`city-photo-panel city-accent-${category.accent}${expanded ? " is-active" : ""}`} key={category.slug}>
        <span className="city-photo-panel-media" aria-hidden="true">{category.slug === "nightlife" ? <img src="/brand/plovdiv-night-kamburov.jpg" alt="" loading="lazy" decoding="async" /> : category.slug === "transport" ? <img src="/brand/plovdiv-aerial.webp" alt="" decoding="async" /> : story?.hero ? <ArticleImage media={{ ...story.hero, alt: "" }} sizes="(min-width: 900px) 600px, 80vw" className="city-photo-panel-image" /> : <span className="city-photo-panel-graphic"><CityMark slug={category.slug} /></span>}</span>
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
            <div className="city-photo-panel-topics" aria-label={`Теми в ${category.title}`}>{topics.slice(0, 4).map(topic => <Link key={topic.title} href={`${ROOT}/${category.slug}/#${cityTopicId(category.topics.indexOf(topic))}`}>{topic.title} <Arrow diagonal /></Link>)}</div>
            <div className="city-photo-panel-bottom"><Link href={`${ROOT}/${category.slug}/`} className="city-photo-panel-all" aria-label={`Всички ${category.topics.length} теми в ${category.title}`}>Всички {category.topics.length} теми <Arrow /></Link>{story ? <Link href={story.path} prefetch={false} className="city-photo-panel-news"><small>СВЪРЗАНА НОВИНА</small><span>{story.title}</span><Arrow diagonal /></Link> : <Link href={cityNewsUrl(category.topics[0]?.title ?? category.title)} className="city-photo-panel-news" aria-label={`Новини за ${category.title} в NewsPoint`}><small>НОВИНИ ПО ТЕМАТА</small><span>Публикации в NewsPoint</span><Arrow diagonal /></Link>}</div>
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

function PreviewBadge() {
  return <span className="city-preview-badge"><span className="city-preview-dot" /> Локален визуален преглед</span>;
}

export function CityGuideHome({ newsByCategory, featuredStories }: { newsByCategory: Record<string, CityStory | null>; featuredStories: CityStory[] }) {
  const motionRoot = useCityReveals();
  const searchRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState("all");
  const normalized = query.trim().toLocaleLowerCase("bg");
  const visible = useMemo(() => CITY_CATEGORIES.filter(category => {
    if (active !== "all" && category.slug !== active) return false;
    if (!normalized) return true;
    return matchesCityQuery(`${category.title} ${category.lead} ${category.topics.map(topic => `${topic.title} ${topic.detail}`).join(" ")}`, normalized);
  }), [active, normalized]);

  return <div className="city-page" ref={motionRoot}>
    <div className="np-container city-container">
      <section id="temi" className="city-directory" aria-labelledby="city-topics-title">
        <div className="city-home-header"><h1 id="city-topics-title">Моят <em>Пловдив.</em></h1></div>
        <div className="city-toolbar"><label className="city-search"><span aria-hidden="true">⌕</span><span className="sr-only">Търси тема</span><input ref={searchRef} type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Търси например автобус, градина, театър..." /></label><span className="city-result-count" aria-live="polite">{visible.length} {visible.length === 1 ? "област" : "области"}</span></div>
        <div className="city-filter-list" role="group" aria-label="Филтър по област"><button type="button" aria-pressed={active === "all"} onClick={() => setActive("all")}>Всички</button>{CITY_CATEGORIES.map(category => <button key={category.slug} type="button" aria-pressed={active === category.slug} onClick={() => setActive(category.slug)}>{category.title}</button>)}</div>
        {visible.length ? <CityPhotoAccordion categories={visible} stories={newsByCategory} query={normalized} /> : <div className="city-empty"><strong>Няма тема с това име.</strong><p>Опитай друга дума или избери „Всички“.</p><button type="button" onClick={() => { setQuery(""); setActive("all"); searchRef.current?.focus(); }}>Покажи всички теми <Arrow /></button></div>}
        <p className="city-photo-credit">Нощна снимка: <a href="https://commons.wikimedia.org/wiki/File:Plovdiv_at_night.jpg" target="_blank" rel="noopener noreferrer">Kostadin Kamburov</a> / <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener noreferrer">CC BY-SA 4.0</a></p>
      </section>
      {featuredStories.length ? <div className="city-home-news"><CityNewsRail stories={featuredStories} title="Новини край теб" /></div> : null}
      <p className="city-proof-note">Това е локален визуален прототип. Категориите показват планирания обхват; не представят непроверени данни като актуални.</p>
    </div>
  </div>;
}

const CITY_INFO_GROUPS: Record<string, { title: string; indices: number[] }[]> = {
  municipality: [
    { title: "Услуги и подкрепа", indices: [0, 1, 5, 6, 7, 13] },
    { title: "Решения и прозрачност", indices: [2, 3, 4, 9, 10, 11, 12] },
    { title: "Работа и градски места", indices: [8, 14] },
  ],
  education: [
    { title: "Прием и семейство", indices: [0, 1, 2, 3, 4, 5] },
    { title: "Студенти и работа", indices: [6, 7, 8, 9] },
  ],
  environment: [
    { title: "Измервания и състояние", indices: [0, 4, 7, 8] },
    { title: "Чистота и зеленина", indices: [1, 2, 3, 5, 6, 9, 10] },
  ],
  culture: [
    { title: "Сцена и музика", indices: [0, 1, 2, 3] },
    { title: "Изкуства и общности", indices: [4, 5, 6, 7, 8] },
  ],
  adopt: [{ title: "Пътят към осиновяване", indices: [0, 1] }],
};

const CITY_INFO_NOTES: Record<string, string> = {
  municipality: "Дневен ред, предложение и прието решение са различни неща. За действащ документ отвори официалната страница.",
  education: "Местата и сроковете се променят. За текущ прием и класиране отвори официалната система.",
  environment: "Измерванията имат час и източник. NewsPoint още не публикува автоматично текущи стойности.",
  culture: "Програма, дата и отмяна се потвърждават при организатора. Тук още няма автоматичен афиш.",
  adopt: "Профилът в приюта е първоизточникът за актуален статус. NewsPoint още не потвърждава автоматично осиновяване.",
};

function CityInfoCard({ topic, index, story }: { topic: CityTopic; index: number; story: CityStory | null }) {
  return <article className="city-info-card" id={cityTopicId(index)} key={topic.title} data-city-reveal>
    <div className="city-info-card-index"><span>{String(index + 1).padStart(2, "0")}</span><span aria-hidden="true">↗</span></div>
    <h3>{topic.title}</h3><p>{topic.detail}</p>
    <div className="city-info-card-source">{topic.source ? <a href={topic.source} target="_blank" rel="noopener noreferrer" aria-label={`Отвори първоизточника за ${topic.title} в нов раздел`}>Отвори първоизточника <Arrow diagonal /></a> : <span>Първоизточникът се проверява</span>}</div>
    <div className="city-info-card-news">{story ? <Link href={story.path} prefetch={false}><small>СВЪРЗАНА НОВИНА</small><strong>{story.title}</strong><Arrow diagonal /></Link> : <Link href={cityNewsUrl(topic.title)} aria-label={`Новини за ${topic.title} в NewsPoint`}><small>НОВИНИ ПО ТЕМАТА</small><strong>Публикации в NewsPoint</strong><Arrow diagonal /></Link>}</div>
  </article>;
}

export function CityCategoryView({ category, stories }: { category: CityCategory; stories: Record<string, CityStory | null> }) {
  const motionRoot = useCityReveals();
  const searchRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const search = query.trim().toLocaleLowerCase("bg");
  const groups = CITY_INFO_GROUPS[category.slug] ?? [{ title: "Всички справки", indices: category.topics.map((_, index) => index) }];
  const visibleGroups = groups.map(group => ({ ...group, indices: group.indices.filter(index => {
    const topic = category.topics[index];
    return topic && (!search || matchesCityQuery(`${topic.title} ${topic.detail}`, search));
  }) })).filter(group => group.indices.length);
  const visibleCount = visibleGroups.reduce((count, group) => count + group.indices.length, 0);
  return <div className={`city-page city-info-page city-info-${category.slug} city-accent-${category.accent}`} ref={motionRoot}><div className="np-container city-container">
    <nav className="city-breadcrumb" aria-label="Навигационна пътека"><Link href="/">Начало</Link><span>/</span><Link href={`${ROOT}/`}>Моят Пловдив</Link><span>/</span><span aria-current="page">{category.title}</span></nav>
    <header className="city-info-hero" data-city-reveal><div className="city-info-hero-copy"><p className="city-eyebrow">МОЯТ ПЛОВДИВ / {category.eyebrow.toLocaleUpperCase("bg")}</p><h1>{category.title}<span>.</span></h1><p>{category.lead}</p><a href="#spravki">Разгледай справките <Arrow /></a></div><div className="city-info-hero-art" aria-hidden="true"><span className="city-info-art-ring" /><span className="city-info-art-mark"><CityMark slug={category.slug} /></span><span className="city-info-art-caption">PLOVDIV / {category.eyebrow.slice(0, 2)}</span></div></header>
    <div className="city-info-notice" role="note"><span aria-hidden="true">✳</span><p>{CITY_INFO_NOTES[category.slug] ?? "За актуална информация отвори първоизточника."}</p></div>
    <section id="spravki" className="city-info-directory" aria-labelledby="city-info-directory-title"><div className="city-info-directory-head"><div><p>ИЗБЕРИ ТЕМА / {String(category.topics.length).padStart(2, "0")} СПРАВКИ</p><h2 id="city-info-directory-title">Намери <em>важното.</em></h2></div>{category.topics.length > 4 ? <label className="city-info-search"><span aria-hidden="true">⌕</span><span className="sr-only">Търси в {category.title}</span><input ref={searchRef} type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Търси тема или справка..." /></label> : null}</div>
      {category.topics.length > 4 ? <span className="sr-only" role="status" aria-live="polite">{visibleCount} {visibleCount === 1 ? "намерена справка" : "намерени справки"}</span> : null}
      {visibleGroups.length ? visibleGroups.map((group, groupIndex) => <section className="city-info-group" aria-label={group.title} key={group.title}><div className="city-info-group-head"><span>{String(groupIndex + 1).padStart(2, "0")} / {group.title}</span><span>{group.indices.length} {group.indices.length === 1 ? "тема" : "теми"}</span></div><div className="city-info-grid">{group.indices.map(index => { const topic = category.topics[index]; return topic ? <CityInfoCard key={topic.title} topic={topic} index={index} story={stories[topic.title] ?? null} /> : null; })}</div></section>) : <div className="city-info-empty"><strong>Няма тема с това име.</strong><button type="button" onClick={() => { setQuery(""); searchRef.current?.focus(); }}>Покажи всички справки <Arrow /></button></div>}
    </section>
    <p className="city-proof-note">Локален визуален преглед. Всяка автоматична справка ще се активира само след проверка на точността, свежестта и промените в източника.</p>
  </div></div>;
}

function CityTransportTopicCard({ topic, index, total, story, featured }: { topic: CityTopic; index: number; total: number; story: CityStory | null; featured?: boolean }) {
  return <article id={cityTopicId(index)} className={"city-transport-card" + (featured ? " city-transport-card-featured" : "")} data-city-reveal>
    <div className="city-transport-card-top"><span>{String(index + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}</span><span aria-hidden="true">↗</span></div>
    <h3>{topic.title}</h3><p>{topic.detail}</p>
    <div className="city-transport-card-source">{topic.source ? <a href={topic.source} target="_blank" rel="noopener noreferrer" aria-label={`Отвори официалната справка за ${topic.title} в нов раздел`}>Отвори официалната справка <Arrow diagonal /></a> : <span>{index === 1 ? "Позиция в реално време ще има след проверка на надежден поток." : "Официален източник се проверява."}</span>}</div>
    <div className="city-transport-card-news">{story ? <Link href={story.path} prefetch={false}><small>СВЪРЗАНА НОВИНА</small><strong>{story.title}</strong><Arrow diagonal /></Link> : <Link href={cityNewsUrl(topic.title)} aria-label={`Новини за ${topic.title} в NewsPoint`}><small>НОВИНИ ПО ТЕМАТА</small><strong>Публикации в NewsPoint</strong><Arrow diagonal /></Link>}</div>
  </article>;
}

export function CityTransportView({ category, stories }: { category: CityCategory; stories: Record<string, CityStory | null> }) {
  const motionRoot = useCityReveals();
  const entries = category.topics.map((topic, index) => ({ topic, index, story: stories[topic.title] ?? null }));
  const featured = entries.filter(({ index }) => index === 0 || index === 2);
  const remaining = entries.filter(({ index }) => index !== 0 && index !== 2);
  return <div className="city-page city-transport-page city-accent-blue" ref={motionRoot}><div className="np-container city-container">
    <nav className="city-breadcrumb" aria-label="Навигационна пътека"><Link href="/">Начало</Link><span>/</span><Link href={ROOT + "/"}>Моят Пловдив</Link><span>/</span><span aria-current="page">{category.title}</span></nav>
    <header className="city-transport-hero" data-city-reveal><div className="city-transport-hero-copy"><p className="city-eyebrow">МОЯТ ПЛОВДИВ / 01</p><h1>Транспорт <em>и движение.</em></h1><p>Маршрути, промени по пътя и полезни официални справки — подредени за бърз избор.</p><a href="#spravki">Към справките <Arrow /></a></div><div className="city-transport-hero-photo" role="img" aria-label="Снимка от въздуха на Пловдив"><span>ПЛОВДИВ / В ДВИЖЕНИЕ</span></div></header>
    <div className="city-transport-note" role="note"><span aria-hidden="true">✳</span><p>За актуални разписания и ограничения отвори първоизточника. NewsPoint още не показва автоматично движение на автобуси или текущи затваряния.</p></div>
    <nav className="city-transport-jumps" aria-label="Бързо към тема">{entries.map(({ topic, index }) => <a href={"#" + cityTopicId(index)} key={topic.title}><span>{String(index + 1).padStart(2, "0")}</span>{topic.title}</a>)}</nav>
    <section id="spravki" className="city-transport-section" aria-labelledby="city-transport-first"><div className="city-transport-section-head"><p>01 / ОСНОВНИ СПРАВКИ</p><h2 id="city-transport-first">Първо <em>провери.</em></h2></div><div className="city-transport-featured-grid">{featured.map(({ topic, index, story }) => <CityTransportTopicCard key={topic.title} topic={topic} index={index} total={entries.length} story={story} featured />)}</div></section>
    <section className="city-transport-section city-transport-more" aria-labelledby="city-transport-more"><div className="city-transport-section-head"><p>02 / ОЩЕ ПО ПЪТЯ</p><h2 id="city-transport-more">Всички <em>посоки.</em></h2></div><div className="city-transport-more-grid">{remaining.map(({ topic, index, story }) => <CityTransportTopicCard key={topic.title} topic={topic} index={index} total={entries.length} story={story} />)}</div></section>
    <p className="city-proof-note">Локален визуален преглед. Не показваме непроверени разписания, позиции на автобуси или текущи ограничения.</p>
  </div></div>;
}

function CityParkingCard({ topic, index, story }: { topic: CityTopic; index: number; story: CityStory | null }) {
  const sourceNames = ["Правила за зоните", "Общински оператор", "Заявления и формуляри", "Правила и контакти"];
  return <article id={cityTopicId(index)} className={`city-parking-card city-parking-card-${index + 1}`} data-city-reveal>
    <div className="city-parking-card-top"><span>{String(index + 1).padStart(2, "0")} / СПРАВКА</span><span aria-hidden="true">↗</span></div>
    <div className="city-parking-card-copy"><h3>{topic.title}</h3><p>{topic.detail}</p></div>
    <div className="city-parking-card-links">
      {topic.source ? <a className="city-parking-primary" href={topic.source} target="_blank" rel="noopener noreferrer" aria-label={`${sourceNames[index]} за ${topic.title} в нов раздел`}>{sourceNames[index]} <Arrow diagonal /></a> : <span className="city-parking-unavailable">Официалният източник се проверява.</span>}
      {index === 0 ? <a className="city-parking-map" href="https://www.plovdiv.bg/administration/municipal-enterprises/op_parking/map/" target="_blank" rel="noopener noreferrer">Карта на синята зона <Arrow diagonal /></a> : null}
    </div>
    <div className="city-parking-card-news">{story ? <Link href={story.path} prefetch={false}><span><small>СВЪРЗАНА НОВИНА</small><strong>{story.title}</strong></span><Arrow diagonal /></Link> : <Link href={cityNewsUrl(topic.title)} aria-label={`Новини за ${topic.title} в NewsPoint`}><span><small>НОВИНИ ПО ТЕМАТА</small><strong>Публикации в NewsPoint</strong></span><Arrow diagonal /></Link>}</div>
  </article>;
}

export function CityParkingView({ category, stories }: { category: CityCategory; stories: Record<string, CityStory | null> }) {
  const motionRoot = useCityReveals();
  const entries = category.topics.map((topic, index) => ({ topic, index, story: stories[topic.title] ?? null }));
  return <div className="city-page city-parking-page city-accent-cyan" ref={motionRoot}><div className="np-container city-container">
    <nav className="city-breadcrumb" aria-label="Навигационна пътека"><Link href="/">Начало</Link><span>/</span><Link href={`${ROOT}/`}>Моят Пловдив</Link><span>/</span><span aria-current="page">{category.title}</span></nav>
    <header className="city-parking-hero" data-city-reveal><div className="city-parking-hero-copy"><p className="city-eyebrow">МОЯТ ПЛОВДИВ / 02</p><h1>Паркиране<span>.</span></h1><p>Зони, общински паркинги, пропуски и репатриране — четири преки пътя към нужната справка.</p><a href="#parking-topics">Избери справка <Arrow /></a></div><div className="city-parking-hero-photo" role="img" aria-label="Изглед от въздуха към Пловдив"><div className="city-parking-photo-frame"><span>ГРАДСКИ ОРИЕНТИР / ПЛОВДИВ</span><strong aria-hidden="true">P</strong><span>02 / НА МЯСТО</span></div></div></header>
    <div className="city-parking-status" role="note"><span aria-hidden="true">✳</span><p>Правилата и картите се отварят от общинските страници. NewsPoint още не показва свободни места, текущи тарифи или автоматично обновени ограничения.</p></div>
    <nav className="city-parking-jumps" aria-label="Бързо към справка">{entries.map(({ topic, index }) => <a key={topic.title} href={`#${cityTopicId(index)}`}><span>{String(index + 1).padStart(2, "0")}</span><strong>{topic.title}</strong><Arrow diagonal /></a>)}</nav>
    <section id="parking-topics" className="city-parking-section" aria-labelledby="parking-first"><div className="city-parking-section-heading"><p>ПАРКИРАНЕ / ПЪРВО ПРОВЕРИ</p><h2 id="parking-first">На правилното <em>място.</em></h2></div><div className="city-parking-grid">{entries.map(({ topic, index, story }) => <CityParkingCard key={topic.title} topic={topic} index={index} story={story} />)}</div></section>
    <p className="city-proof-note">Локален визуален преглед. Официалните линкове не означават, че NewsPoint вече следи промените или наличните места.</p>
  </div></div>;
}

function CityOutageIcon({ index }: { index: number }) {
  const shapes = [
    <path key="water" d="M12 2c-2.8 4.2-7 8.8-7 13a7 7 0 0 0 14 0c0-4.2-4.2-8.8-7-13Z" />,
    <path key="power" d="m13 2-8 11h6l-1 9 9-12h-6V2Z" />,
    <g key="heat"><path d="M6 21c-2-3 2-4 0-7s2-4 0-7M12 21c-2-3 2-4 0-7s2-4 0-7M18 21c-2-3 2-4 0-7s2-4 0-7" /></g>,
    <g key="road"><path d="M4 21 8 3m12 18L16 3M12 5v3m0 4v3m0 4v2" /></g>,
  ];
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{shapes[index]}</svg>;
}

export function CityOutagesView({ category, stories }: { category: CityCategory; stories: Record<string, CityStory | null> }) {
  const motionRoot = useCityReveals();
  const labels = ["ВОДА", "ЕЛЕКТРИЧЕСТВО", "ТОПЛОПОДАВАНЕ", "УЛИЦИ"];
  const sourceNames = ["ВиК", "ЕР Юг", "EVN Топлофикация", "Община Пловдив"];
  return <div className="city-page city-outages-page city-accent-indigo" ref={motionRoot}><div className="np-container city-container">
    <nav className="city-breadcrumb" aria-label="Навигационна пътека"><Link href="/">Начало</Link><span>/</span><Link href={`${ROOT}/`}>Моят Пловдив</Link><span>/</span><span aria-current="page">{category.title}</span></nav>
    <header className="city-outages-header" data-city-reveal>
      <div className="city-outages-heading"><p className="city-eyebrow">МОЯТ ПЛОВДИВ / 03</p><h1>Аварии <em>и ремонти.</em></h1><p>Вода, ток, топло и улици — бърз достъп до справките за Пловдив.</p></div>
      <div className="city-outages-notice" role="note"><span aria-hidden="true">✳</span><div><strong>За актуален статус отвори първоизточника.</strong><p>NewsPoint още не показва автоматично текущи случаи. Бутоните по-долу водят към страниците на отговорните организации.</p></div></div>
    </header>
    <section className="city-outages-services" aria-label="Справки за аварии и ремонти">
      <div className="city-outages-services-head"><span>ИЗБЕРИ СПРАВКА</span><span>01—04 / ПЛОВДИВ</span></div>
      <div className="city-outages-grid">{category.topics.map((topic, index) => {
        const story = stories[topic.title];
        return <article className={`city-outage-card city-outage-card-${index + 1}`} id={cityTopicId(index)} key={topic.title} data-city-reveal>
          <div className="city-outage-card-top"><span className="city-outage-card-icon"><CityOutageIcon index={index} /></span><span className="city-outage-card-number">{String(index + 1).padStart(2, "0")} / {labels[index]}</span></div>
          <h2>{topic.title}</h2><p>{topic.detail}</p>
          <div className="city-outage-card-actions">{topic.source ? <a href={topic.source} target="_blank" rel="noopener noreferrer" aria-label={`Справка за ${topic.title} при ${sourceNames[index]} в нов раздел`}>Към {sourceNames[index]} <Arrow diagonal /></a> : <span>Източникът се проверява</span>}</div>
          <div className="city-outage-card-news">{story ? <Link href={story.path} prefetch={false}><span><small>СВЪРЗАНА НОВИНА</small><strong>{story.title}</strong></span><Arrow diagonal /></Link> : <Link href={cityNewsUrl(topic.title)} aria-label={`Новини за ${topic.title} в NewsPoint`}><span><small>НОВИНИ ПО ТЕМАТА</small><strong>Публикации в NewsPoint</strong></span><Arrow diagonal /></Link>}</div>
        </article>;
      })}</div>
    </section>
    <p className="city-proof-note">Локален визуален преглед. Тази страница не представя непроверени прекъсвания или ремонти като текущи.</p>
  </div></div>;
}

export function CityOutView({ stories }: { stories: CityStory[] }) {
  const motionRoot = useCityReveals();
  const nightTopics = CITY_CATEGORIES.find(category => category.slug === "nightlife")?.topics ?? [];
  const [selected, setSelected] = useState("Всички");
  const [period, setPeriod] = useState("Днес");
  const groups = ["Всички", "Музика", "Сцена", "Студентски", "Преживявания"];
  const groupTopics: Record<string, string[]> = {
    Всички: [...OUT_TOPICS],
    Музика: ["Партита", "Концерти", "DJ и електронна музика", "Рап и хип-хоп", "Попфолк, балканска и турска музика", "Музика на живо"],
    Сцена: ["Стендъп", "Творчески работилници"],
    Студентски: ["Студентски вечери", "Младежки инициативи", "Доброволчество и обучения"],
    Преживявания: ["Куизове", "Настолни игри", "Гейминг", "Безплатно"],
  };
  return <div className="city-page city-out-page" ref={motionRoot}><div className="np-container city-container">
    <nav className="city-breadcrumb" aria-label="Навигационна пътека"><Link href="/">Начало</Link><span>/</span><Link href={`${ROOT}/`}>Моят Пловдив</Link><span>/</span><span aria-current="page">Нощен Пловдив</span></nav>
    <div className="city-out-hero" data-city-reveal><div className="city-out-hero-image" role="img" aria-label="Реална нощна снимка на Пловдив от Небет тепе" /><div className="city-out-hero-vignette" /><div className="city-out-hero-sheen" aria-hidden="true" /><div className="city-out-hero-content"><p className="city-out-hero-kicker">МОЯТ ПЛОВДИВ / 09 / ПЛОВДИВ OUT</p><h1>Нощен <em>Пловдив.</em></h1><p className="city-out-hero-tagline">Градът след залез.</p><p className="city-out-hero-desc">Музика, сцени, идеи и срещи. Програмата ще се появи тук след проверка на датите и промените.</p><a href="#out-discover" className="city-out-hero-button">Разгледай темите <Arrow /></a></div><div className="city-out-hero-footer"><span>Снимка: <a href="https://commons.wikimedia.org/wiki/File:Plovdiv_at_night.jpg" target="_blank" rel="noopener noreferrer">Kostadin Kamburov</a> / <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener noreferrer">CC BY-SA 4.0</a></span><span>09 / МОЯТ ПЛОВДИВ</span></div></div>
    <section id="out-discover" className="city-out-discover"><div className="city-section-head"><div><p className="city-eyebrow">09 / НОЩЕН ПЛОВДИВ</p><h2>Избери своя <em>ритъм.</em></h2><p>Направленията на бъдещия афиш са подредени тук. Публикуваме събития само след проверка.</p></div><PreviewBadge /></div><div className="city-filter-list city-out-filters" role="group" aria-label="Филтър на нощните теми">{groups.map(group => <button type="button" key={group} aria-pressed={selected === group} onClick={() => setSelected(group)}>{group}</button>)}</div><span className="sr-only" role="status" aria-live="polite">{(groupTopics[selected] ?? []).length} теми в {selected}</span><div className="city-out-topic-grid" key={selected}>{(groupTopics[selected] ?? []).map(topic => <article id={cityTopicId(OUT_TOPICS.indexOf(topic as (typeof OUT_TOPICS)[number]))} className="city-out-topic" key={topic}><span className="city-out-topic-index">{String(OUT_TOPICS.indexOf(topic as (typeof OUT_TOPICS)[number]) + 1).padStart(2, "0")}</span><h3>{topic}</h3><p>{nightTopics.find(item => item.title === topic)?.detail}</p><Link href={cityNewsUrl(topic)} aria-label={`Новини за ${topic} в NewsPoint`}>Новини по темата <Arrow diagonal /></Link></article>)}</div></section>
    <section className="city-out-agenda" aria-labelledby="city-agenda-title"><div className="city-out-agenda-head"><div><p className="city-eyebrow">ЕДИНЕН АФИШ / ВИЗУАЛЕН ПРЕГЛЕД</p><h2 id="city-agenda-title">Плановете <em>започват тук.</em></h2></div><div className="city-filter-list city-period-filters" role="group" aria-label="Период на афиша">{["Днес", "Тази вечер", "Уикенд", "7 дни", "Безплатно"].map(option => <button type="button" key={option} aria-pressed={period === option} onClick={() => setPeriod(option)}>{option}</button>)}</div></div><div className="city-out-agenda-panel"><div className="city-agenda-decoration" aria-hidden="true"><span>✳</span></div><div><span className="city-agenda-status">АФИШЪТ СЕ ПОДГОТВЯ</span><h3>Добрата вечер<br />започва с <em>точна информация.</em></h3><p aria-live="polite">За „{period}“ още не показваме събития. След проверката тук ще има дата, час, място, статус и билетен линк при наличие.</p><a href="#out-sources">Виж източниците <Arrow /></a></div></div></section>
    <section id="out-sources" className="city-out-sources"><div><p className="city-eyebrow">ПЪРВОИЗТОЧНИЦИ / ПОД НАБЛЮДЕНИЕ</p><h2>Афишът започва<br />от <em>източника.</em></h2><p>Събития ще се показват тук само когато датата, мястото и промените могат да се проверяват надеждно. Разгледай програмите на организаторите.</p></div><div className="city-out-source-links"><a href="https://operaplovdiv.bg/bg/site/program" target="_blank" rel="noopener noreferrer"><span>01</span> Опера Пловдив <Arrow diagonal /></a><a href="https://tickets.dtp.bg/" target="_blank" rel="noopener noreferrer"><span>02</span> Драматичен театър <Arrow diagonal /></a><a href="https://www.clubcode.bg/language/bg/our-events/" target="_blank" rel="noopener noreferrer"><span>03</span> Club Code <Arrow diagonal /></a><a href="https://culture.plovdiv.bg/" target="_blank" rel="noopener noreferrer"><span>04</span> Култура Пловдив <Arrow diagonal /></a></div></section>
    {stories.length ? <CityNewsRail stories={stories} title="Нощта в новините" /> : null}
    <p className="city-proof-note">Локален визуален прототип. В момента няма публикуван календар или потвърдени събития в NewsPoint; секциите показват бъдещата структура.</p>
  </div></div>;
}
