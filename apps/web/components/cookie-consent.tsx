"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ALL_OPTIONAL_CONSENT, NO_OPTIONAL_CONSENT, OPEN_COOKIE_SETTINGS, type ConsentChoices } from "@/lib/cookie-consent";
import { applyCookieChoices } from "@/lib/cookie-consent-effects";
import { currentCookieConsent, saveCookieConsent, useCookieConsent } from "./cookie-consent-store";
import "./cookie-consent.css";

const categories = [
  { key: "preferences", title: "Удобства", text: "Запомня последните ви търсения само в този браузър. Търсенето работи и без тази история." },
  { key: "statistics", title: "Статистика", text: "Разрешава Google Analytics и собствения брояч на прочитанията, за да разбираме кои материали се четат." },
  { key: "external", title: "Външно съдържание", text: "Зарежда вградените видеа и камери. Доставчиците им получават технически данни и може да използват свои бисквитки. При изключване остава връзка към източника." },
] as const;

export function CookieConsent() {
  const consent = useCookieConsent();
  const [open, setOpen] = useState(false);
  const [choices, setChoices] = useState<ConsentChoices>(NO_OPTIONAL_CONSENT);
  const [notice, setNotice] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const id = useId();

  useEffect(() => {
    const show = () => {
      trigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setChoices({ ...(currentCookieConsent() ?? NO_OPTIONAL_CONSENT) });
      setOpen(true);
    };
    window.addEventListener(OPEN_COOKIE_SETTINGS, show);
    return () => window.removeEventListener(OPEN_COOKIE_SETTINGS, show);
  }, []);

  useEffect(() => {
    if (!consent.ready) return;
    const controller = new AbortController();
    void applyCookieChoices(consent.record ?? NO_OPTIONAL_CONSENT, controller.signal);
    return () => controller.abort();
  }, [consent.ready, consent.record]);

  useEffect(() => {
    if (!open) return;
    const node = dialog.current;
    if (!node) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    node.showModal(); heading.current?.focus();
    return () => {
      node.close(); document.body.style.overflow = previous;
      if (trigger.current?.isConnected) trigger.current.focus({ preventScroll: true });
    };
  }, [open]);

  function save(next: ConsentChoices, all = false) {
    const persistent = saveCookieConsent(next, all ? "all" : "selection");
    setNotice(persistent ? "" : "Браузърът не позволява запазване. Изборът важи за този отворен раздел до презареждане.");
    setOpen(false);
  }

  return <>
    {consent.ready && !consent.record ? <section hidden={open} className="np-cookie-banner np-cookie-surface" aria-labelledby={`${id}-banner-title`}>
      <div className="np-cookie-copy"><span className="np-cookie-kicker">NEWSPOINT · ВАШИЯТ ИЗБОР</span>
        <h2 id={`${id}-banner-title`}>Малко настройки. Ясен избор.</h2>
        <p>Използваме необходими записи за работата на сайта. С ваше съгласие добавяме история на търсенията, Google Analytics и брояч на прочитанията, както и външни видеа и камери. Можете да четете и само с необходимите.</p>
        <a href="/cookies-policy/">Политика за бисквитките</a><span aria-hidden="true"> · </span><a href="/personal-data-policy/">Лични данни</a>
      </div>
      <div className="np-cookie-actions">
        <button type="button" onClick={() => save(ALL_OPTIONAL_CONSENT, true)}>Приеми всички</button>
        <button type="button" onClick={() => save(NO_OPTIONAL_CONSENT)}>Само необходимите</button>
        <button type="button" onClick={() => window.dispatchEvent(new Event(OPEN_COOKIE_SETTINGS))}>Настройки</button>
      </div>
    </section> : null}
    {notice ? <p role="status" className="np-cookie-notice np-cookie-surface">{notice}<button type="button" aria-label="Затвори съобщението" onClick={() => setNotice("")}>×</button></p> : null}
    <dialog ref={dialog} className="np-cookie-dialog np-cookie-surface" aria-labelledby={`${id}-title`} aria-describedby={`${id}-intro`}
      onCancel={event => { event.preventDefault(); setOpen(false); }} onClick={event => { if (event.target === event.currentTarget) { const r = event.currentTarget.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) setOpen(false); } }}>
      <div className="np-cookie-dialog-head"><div><span className="np-cookie-kicker">ПОВЕРИТЕЛНОСТ · NEWSPOINT</span><h2 ref={heading} tabIndex={-1} id={`${id}-title`}>Настройки за бисквитки</h2></div><button type="button" className="np-cookie-close" aria-label="Затвори без запазване" onClick={() => setOpen(false)}>×</button></div>
      <div className="np-cookie-dialog-body">
        <p id={`${id}-intro`}>Изберете какво разрешавате. Допълнителните категории са изключени, докато не ги приемете. Промяна се прилага с „Запази избора“.</p>
        <div className="np-cookie-category"><div><h3>Необходими</h3><p>Работа и защита на сайта, запомняне на този избор и изрично поискани функции като тема, гласуване и известия. Не включва статистика.</p></div><span className="np-cookie-always">Винаги активни</span></div>
        {categories.map(category => <label className="np-cookie-category" key={category.key}><span><strong>{category.title}</strong><span id={`${id}-${category.key}`} className="np-cookie-description">{category.text}</span></span><input type="checkbox" role="switch" aria-describedby={`${id}-${category.key}`} checked={choices[category.key]} onChange={event => setChoices(previous => ({ ...previous, [category.key]: event.target.checked }))} /></label>)}
        <p>Изборът се помни до 180 дни в този браузър. Можете да го промените от „Настройки за бисквитки“ във футъра и в настройките на сайта. При спиране на вече заредена статистика страницата се презарежда, за да се прекрати работата ѝ.</p>
        <a href="/cookies-policy/">Вижте имената, сроковете и доставчиците</a>
      </div>
      <div className="np-cookie-dialog-foot np-cookie-actions">
        <button type="button" onClick={() => save(choices)}>Запази избора</button>
        <button type="button" onClick={() => save(NO_OPTIONAL_CONSENT)}>Само необходимите</button>
        <button type="button" onClick={() => save(ALL_OPTIONAL_CONSENT, true)}>Приеми всички</button>
      </div>
    </dialog>
  </>;
}
