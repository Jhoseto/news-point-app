"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { CITY_CATEGORIES, type CityCategory } from "@/lib/city-guide/catalog";
import { cityNewsUrl, type CityStory } from "@/lib/city-guide/news";
import { nightEventStatusLabel, nightPeriodMatches, type CityNightEvent } from "@/lib/city-guide/night-events";
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
  return <aside className="city-news-rail" aria-label={title}><div className="city-news-rail-head"><span>NEWSPOINT / КОНТЕКСТ</span><h2>{title}</h2><p>Новините допълват справките и се подбират отново при обновяване на публикациите.</p></div><div className="city-news-rail-list">{stories.map(story => <Link key={story.path} href={story.path} prefetch={false} className="city-news-rail-story"><span className="city-news-rail-photo"><ArticleImage media={story.hero ? { ...story.hero, alt: "" } : null} sizes="96px" className="city-news-rail-image" /></span><span className="city-news-rail-copy"><time dateTime={story.publishedAt}>{storyDate.format(new Date(story.publishedAt))}</time><strong>{story.title}</strong></span><Arrow diagonal /></Link>)}</div><Link href="/plovdiv/" className="city-news-rail-more">Всички новини от Пловдив <Arrow diagonal /></Link></aside>;
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
        <span className="city-photo-panel-media" aria-hidden="true">{category.slug === "nightlife" ? <img src="/brand/plovdiv-night-kamburov.jpg" alt="" loading="lazy" decoding="async" /> : category.slug === "transport" ? <img src="/brand/plovdiv-aerial.webp" alt="" decoding="async" /> : category.slug === "education" ? <img src="/brand/plovdiv-school-public-domain.webp" alt="" loading="lazy" decoding="async" /> : category.slug === "culture" ? <img src="/brand/plovdiv-theatre-public-domain.webp" alt="" loading="lazy" decoding="async" /> : story?.hero ? <ArticleImage media={{ ...story.hero, alt: "" }} sizes="(min-width: 900px) 600px, 80vw" className="city-photo-panel-image" /> : <span className="city-photo-panel-graphic"><CityMark slug={category.slug} /></span>}</span>
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
            <div className="city-photo-panel-topics" aria-label={`Теми в ${category.title}`}>{topics.slice(0, 4).map(topic => <Link key={topic.title} href={`${ROOT}/${category.slug}/${topicHrefByCategory[category.slug]?.[topic.title] ?? ""}`}>{topic.title} <Arrow diagonal /></Link>)}</div>
            <div className="city-photo-panel-bottom"><Link href={`${ROOT}/${category.slug}/`} className="city-photo-panel-all" aria-label={`${activeTopics.length} справки с данни в ${category.title}`}>{activeTopics.length} справки с данни <Arrow /></Link>{story ? <Link href={story.path} prefetch={false} className="city-photo-panel-news"><small>СВЪРЗАНА НОВИНА</small><span>{story.title}</span><Arrow diagonal /></Link> : null}</div>
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

  return <div className="city-page" ref={motionRoot}>
    <div className="np-container city-container">
      <section id="temi" className="city-directory" aria-labelledby="city-topics-title">
        <div className="city-home-header"><h1 id="city-topics-title">Моят <em>Пловдив.</em></h1></div>
        <div className="city-toolbar"><label className="city-search"><span aria-hidden="true">⌕</span><span className="sr-only">Търси тема</span><input ref={searchRef} type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Търси например автобус, градина, театър..." /></label><span className="city-result-count" aria-live="polite">{visible.length} {visible.length === 1 ? "област" : "области"}</span></div>
        {visible.length ? <CityPhotoAccordion categories={visible} stories={newsByCategory} query={normalized} activeTopicsByCategory={activeTopicsByCategory} topicHrefByCategory={topicHrefByCategory} /> : <div className="city-empty"><strong>Няма справка с данни за това търсене.</strong><p>Опитай друга дума.</p><button type="button" onClick={() => { setQuery(""); searchRef.current?.focus(); }}>Покажи наличните справки <Arrow /></button></div>}
        <p className="city-photo-credit">Нощна снимка: Kostadin Kamburov / CC BY-SA 4.0</p>
      </section>
      {today}
      {featuredStories.length ? <div className="city-home-news"><CityNewsRail stories={featuredStories} title="Новини край теб" /></div> : null}
      <p className="city-proof-note">Локален преглед на справки от текущия пилот. Данните се публикуват едва след проверка на точността и обновяването им.</p>
    </div>
  </div>;
}

export function CityCategoryView({ category, stories, observations }: { category: CityCategory; stories: Record<string, CityStory | null>; observations?: React.ReactNode }) {
  const motionRoot = useCityReveals();
  const related = [...new Map(Object.values(stories).filter((story): story is CityStory => !!story).map(story => [story.path, story])).values()].slice(0, 3);
  const intro: Record<string, string> = {
    municipality: "Предстоящи срокове, отворени обсъждания и условия за кандидатстване. Избери какво те интересува.",
    education: "Свободните места за прием са на преден план. Училищните адреси са под ръка, когато ти потрябват.",
    environment: "Кога идва мобилният пункт, къде да предадеш отпадъци и как да заявиш извозване.",
    culture: "Планирай следващото излизане — театър, опера и изложби с конкретни дати и места.",
    adopt: "Запознай се с животните и прочети как протича осиновяването.",
  };
  const photo = category.slug === "education" ? "/brand/plovdiv-school-public-domain.webp" : category.slug === "culture" ? "/brand/plovdiv-theatre-public-domain.webp" : "/brand/plovdiv-aerial.webp";
  return <div className={`city-page city-info-page city-info-${category.slug} city-accent-${category.accent}`} ref={motionRoot}><div className="np-container city-container">
    <nav className="city-breadcrumb" aria-label="Навигационна пътека"><Link href="/">Начало</Link><span>/</span><Link href={`${ROOT}/`}>Моят Пловдив</Link><span>/</span><span aria-current="page">{category.title}</span></nav>
    <header className="city-editorial-hero"><img src={photo} alt="" decoding="async" /><div className="city-editorial-hero-copy"><span>МОЯТ ПЛОВДИВ / {category.eyebrow.toLocaleUpperCase("bg")}</span><h1>{category.title}</h1><p>{intro[category.slug] ?? category.lead}</p><a href="#city-observed-title">Намери нужната информация <Arrow /></a></div><span className="city-editorial-hero-label">ПЛОВДИВ / ТВОЯТ ГРАД</span></header>
    {observations}
    {related.length ? <aside className="city-context-stories" aria-label="Новини към справките"><header><h2>Историите зад темите</h2><span>Още контекст от NewsPoint</span></header><div>{related.map(story => <Link className="city-context-story" key={story.path} href={story.path} prefetch={false}><span className="city-context-story-photo"><ArticleImage media={story.hero ? { ...story.hero, alt: "" } : null} sizes="160px" className="city-context-story-image" /></span><span><time dateTime={story.publishedAt}>{storyDate.format(new Date(story.publishedAt))}</time><strong>{story.title}</strong></span></Link>)}</div></aside> : null}
  </div></div>;
}

export function CityTransportView({ category, stories, observations, activeTopics = [], hasFareData = false, hasRouteData = false }: { category: CityCategory; stories: Record<string, CityStory | null>; observations?: React.ReactNode; activeTopics?: string[]; hasFareData?: boolean; hasRouteData?: boolean }) {
  const motionRoot = useCityReveals();
  const related = activeTopics.flatMap(title => stories[title] ? [stories[title]!] : []).slice(0, 3);
  return <div className="city-page city-transport-page city-accent-blue" ref={motionRoot}><div className="np-container city-container">
    <nav className="city-breadcrumb" aria-label="Навигационна пътека"><Link href="/">Начало</Link><span>/</span><Link href={ROOT + "/"}>Моят Пловдив</Link><span>/</span><span aria-current="page">{category.title}</span></nav>
    <header className="city-transport-hero" data-city-reveal><div className="city-transport-hero-copy"><p className="city-eyebrow">МОЯТ ПЛОВДИВ / 01</p><h1>Транспорт <em>и движение.</em></h1><p>Маршрути, промени по пътя и полезни официални справки — подредени за бърз избор.</p><a href={hasRouteData ? "#nablyudavani-plovdiv-livetransport-gtfs" : hasFareData ? "#nablyudavani-plovdiv-transit" : "#city-observed-title"}>Към справките <Arrow /></a></div><div className="city-transport-hero-photo" role="img" aria-label="Снимка от въздуха на Пловдив"><span>ПЛОВДИВ / В ДВИЖЕНИЕ</span></div></header>
    <div className="city-transport-note" role="note"><span aria-hidden="true">✳</span><p>{hasRouteData ? "По-долу са публикуваните линии и посоки за днес. Часове по спирки, позиции на автобусите и текущи затваряния още не са проверени." : hasFareData ? "По-долу са последно наблюдаваните цени за билети и карти. Разписания, движение на автобуси и текущи затваряния още не се показват автоматично." : "Проверените транспортни справки се показват по-долу."}</p></div>
    {observations}
    {related.length ? <CityNewsRail stories={related} title="Новини по темите" /> : null}
    <p className="city-proof-note">Локален визуален преглед. Не показваме непроверени часове по спирки, позиции на автобуси или временни затваряния.</p>
  </div></div>;
}

export function CityParkingView({ category, stories, observations, hasObservedData = false }: { category: CityCategory; stories: Record<string, CityStory | null>; observations?: React.ReactNode; hasObservedData?: boolean }) {
  const motionRoot = useCityReveals();
  const related = category.topics.flatMap(topic => stories[topic.title] ? [stories[topic.title]!] : []).slice(0, 3);
  return <div className="city-page city-parking-page city-accent-cyan" ref={motionRoot}><div className="np-container city-container">
    <nav className="city-breadcrumb" aria-label="Навигационна пътека"><Link href="/">Начало</Link><span>/</span><Link href={`${ROOT}/`}>Моят Пловдив</Link><span>/</span><span aria-current="page">{category.title}</span></nav>
    <header className="city-parking-hero" data-city-reveal><div className="city-parking-hero-copy"><p className="city-eyebrow">МОЯТ ПЛОВДИВ / 02</p><h1>Паркиране<span>.</span></h1><p>Проверени правила за зоните и контакти при репатриране — на едно място.</p><a href="#city-observed-title">Към справките <Arrow /></a></div><div className="city-parking-hero-photo" role="img" aria-label="Изглед от въздуха към Пловдив"><div className="city-parking-photo-frame"><span>ГРАДСКИ ОРИЕНТИР / ПЛОВДИВ</span><strong aria-hidden="true">P</strong><span>02 / НА МЯСТО</span></div></div></header>
    <div className="city-parking-status" role="note"><span aria-hidden="true">✳</span><p>{hasObservedData ? "Наблюдаваните правила и контакти са по-долу. Свободни места, карта и временни изключения още не са потвърдени." : "Картите, правилата и наличностите ще се виждат тук след проверка на източниците. NewsPoint още не показва свободни места, текущи тарифи или автоматично обновени ограничения."}</p></div>
    {observations}
    {related.length ? <CityNewsRail stories={related} title="Новини по темите" /> : null}
    <p className="city-proof-note">Локален пилот. Наблюдаваните правила не включват свободни места или всички временни изключения.</p>
  </div></div>;
}

export function CityOutagesView({ category, stories, observations }: { category: CityCategory; stories: Record<string, CityStory | null>; observations?: React.ReactNode }) {
  const motionRoot = useCityReveals();
  const related = category.topics.flatMap(topic => stories[topic.title] ? [stories[topic.title]!] : []).slice(0, 3);
  return <div className="city-page city-outages-page city-accent-indigo" ref={motionRoot}><div className="np-container city-container">
    <nav className="city-breadcrumb" aria-label="Навигационна пътека"><Link href="/">Начало</Link><span>/</span><Link href={`${ROOT}/`}>Моят Пловдив</Link><span>/</span><span aria-current="page">{category.title}</span></nav>
    <header className="city-outages-header" data-city-reveal>
      <div className="city-outages-heading"><p className="city-eyebrow">МОЯТ ПЛОВДИВ / 03</p><h1>Аварии <em>и ремонти.</em></h1><p>Проверените справки за прекъсвания в Пловдив — с час на последната проверка.</p></div>
      <div className="city-outages-notice" role="note"><span aria-hidden="true">✳</span><div><strong>Последните наблюдения са по-долу.</strong><p>Посоченият срок не доказва приключване. При неуспешна или просрочена проверка записите се скриват.</p></div></div>
    </header>
    {observations}
    {related.length ? <CityNewsRail stories={related} title="Новини по темите" /> : null}
    <p className="city-proof-note">Локален визуален преглед. Тази страница не представя непроверени прекъсвания или ремонти като текущи.</p>
  </div></div>;
}

const nightDate = new Intl.DateTimeFormat("bg-BG", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Sofia" });
const nightTime = new Intl.DateTimeFormat("bg-BG", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Sofia" });

export function CityOutView({ stories, observations, events = [], checkedAt, nowIso }: { stories: CityStory[]; observations?: React.ReactNode; events?: CityNightEvent[]; checkedAt?: string; nowIso: string }) {
  const motionRoot = useCityReveals();
  const [period, setPeriod] = useState("Сега и после");
  const [nowMs, setNowMs] = useState(() => Date.parse(nowIso));
  useEffect(() => {
    setNowMs(Date.now());
    const timer = window.setInterval(() => setNowMs(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, [nowIso]);
  const visibleEvents = events.filter(event => nightPeriodMatches(event, period, new Date(nowMs))).sort((a, b) => Date.parse(a.startDate) - Date.parse(b.startDate));
  const periodOptions = ["Сега и после", "Днес", "Тази вечер", "Уикенд", "7 дни", "Безплатно"].filter(option => events.some(event => nightPeriodMatches(event, option, new Date(nowMs))));
  return <div className={`city-page city-out-page${events.length ? " city-out-has-events" : ""}`} ref={motionRoot}><div className="np-container city-container">
    <nav className="city-breadcrumb" aria-label="Навигационна пътека"><Link href="/">Начало</Link><span>/</span><Link href={`${ROOT}/`}>Моят Пловдив</Link><span>/</span><span aria-current="page">Нощен Пловдив</span></nav>
    <div className="city-out-hero" data-city-reveal><div className="city-out-hero-image" role="img" aria-label="Реална нощна снимка на Пловдив от Небет тепе" /><div className="city-out-hero-vignette" /><div className="city-out-hero-sheen" aria-hidden="true" /><div className="city-out-hero-content"><p className="city-out-hero-kicker">МОЯТ ПЛОВДИВ / 09 / ПЛОВДИВ OUT</p><h1>Нощен <em>Пловдив.</em></h1><p className="city-out-hero-tagline">Градът след залез.</p><p className="city-out-hero-desc">{events.length ? "Наблюдавани дати, часове и места от клубната програма. Промените и отмените още се проверяват." : "Музика, сцени, идеи и срещи. Програмата ще се появи тук след проверка на датите и промените."}</p><a href="#city-agenda-title" className="city-out-hero-button">Към афиша <Arrow /></a></div><div className="city-out-hero-footer"><span>Снимка: Kostadin Kamburov / CC BY-SA 4.0</span><span>09 / МОЯТ ПЛОВДИВ</span></div></div>
    {observations}
    <section className="city-out-agenda" aria-labelledby="city-agenda-title"><div className="city-out-agenda-head"><div><p className="city-eyebrow">КЛУБЕН АФИШ / ЛОКАЛЕН ПИЛОТ</p><h2 id="city-agenda-title">Събития <em>след залез.</em></h2>{checkedAt && events.length ? <p className="city-night-checked">Клубна програма · проверено {new Intl.DateTimeFormat("bg-BG", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Sofia" }).format(new Date(checkedAt))}. Пълнотата и отмените още се проверяват.</p> : null}</div><div className="city-filter-list city-period-filters" role="group" aria-label="Период на афиша">{periodOptions.map(option => <button type="button" key={option} aria-pressed={period === option} onClick={() => setPeriod(option)}>{option}</button>)}</div></div>{visibleEvents.length ? <div className="city-night-event-grid" aria-live="polite">{visibleEvents.map((event, index) => <article key={event.key} className={`city-night-event${index === 0 ? " city-night-event-featured" : ""}`}><div className="city-night-event-date"><time dateTime={event.startDate}>{nightDate.format(new Date(event.startDate))}</time><strong>{nightTime.format(new Date(event.startDate))}</strong></div><div className="city-night-event-body"><span>{nightEventStatusLabel(event, new Date(nowMs))}</span><h3>{event.title}</h3><p>{event.place}</p></div><div className="city-night-event-side"><span>{event.price ? `${event.price} евро · посочена цена` : "Цена не е потвърдена"}</span><Link href={cityNewsUrl("Партита")}>Новини по темата <Arrow diagonal /></Link></div></article>)}</div> : <div className="city-night-empty" role="status"><strong>Няма проверени записи за „{period}“.</strong><p>{events.length ? "Проверете друг период или изчакайте следващата проверка на програмата." : "Не представяме непълни дати като предстоящи събития."}</p></div>}</section>
    {stories.length ? <CityNewsRail stories={stories} title="Нощта в новините" /> : null}
    <p className="city-proof-note">Локален пилот. Наблюдаваните събития не са преминали седемдневната проверка за пълнота и отмени; цените се показват само когато са посочени в източника.</p>
  </div></div>;
}
