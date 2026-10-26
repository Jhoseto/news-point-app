"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { CITY_CATEGORIES } from "@/lib/city-guide/catalog";
import { cityReaderTopicLabel } from "@/lib/city-guide/presentation";
import "./city-local-nav.css";

export type CityNavTopic = { title: string; href: string };

export function CityLocalNav({ currentSlug, availableSlugs, topics = [] }: {
  currentSlug?: string;
  availableSlugs: string[];
  topics?: CityNavTopic[];
}) {
  const [activeTopic, setActiveTopic] = useState("");
  const [categoryMenuOpen, setCategoryMenuOpen] = useState(false);
  const navRef = useRef<HTMLElement>(null);
  const current = CITY_CATEGORIES.find(category => category.slug === currentSlug);
  useEffect(() => {
    const update = () => setActiveTopic(window.location.hash);
    update(); window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
  useEffect(() => {
    if (!categoryMenuOpen) return;
    const closeOutside = (event: PointerEvent) => { if (!navRef.current?.contains(event.target as Node)) setCategoryMenuOpen(false); };
    const closeEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setCategoryMenuOpen(false); };
    document.addEventListener("pointerdown", closeOutside); document.addEventListener("keydown", closeEscape);
    return () => { document.removeEventListener("pointerdown", closeOutside); document.removeEventListener("keydown", closeEscape); };
  }, [categoryMenuOpen]);
  const categories = CITY_CATEGORIES.filter(category => availableSlugs.includes(category.slug));
  return <nav className="city-local-nav city-focused-nav" ref={navRef} aria-label="Навигация в Моят Пловдив">
    <div className="city-local-nav-inner">
      <Link href="/moyat-plovdiv/" className="city-local-nav-brand" aria-current={!currentSlug ? "page" : undefined}><span className="city-local-nav-symbol" aria-hidden="true">✳</span><span>МОЯТ<br /><strong>ПЛОВДИВ</strong></span></Link>
      <button className="city-category-picker-button" type="button" aria-expanded={categoryMenuOpen} aria-controls="city-category-picker" onClick={() => setCategoryMenuOpen(open => !open)}><span>{current?.title ?? "Всички категории"}</span><span aria-hidden="true">⌄</span></button>
      {topics.length ? <div className="city-local-nav-topics"><div>{topics.map(topic => <a href={topic.href} onClick={() => setActiveTopic(topic.href)} aria-current={activeTopic === topic.href ? "location" : undefined} key={`${topic.title}:${topic.href}`}>{cityReaderTopicLabel(topic.title)}</a>)}</div></div> : <span className="city-nav-prompt">Градът ти, подреден.</span>}
    </div>
    {categoryMenuOpen ? <div className="city-category-picker" id="city-category-picker"><p>ИЗБЕРИ КЪДЕ ДА ПРОДЪЛЖИШ</p><div>{categories.map((category, index) => <Link key={category.slug} href={`/moyat-plovdiv/${category.slug}/`} aria-current={category.slug === currentSlug ? "page" : undefined} onClick={() => setCategoryMenuOpen(false)}><span>{String(index + 1).padStart(2, "0")}</span><strong>{category.title}</strong><span aria-hidden="true">↗</span></Link>)}</div></div> : null}
  </nav>;
}
