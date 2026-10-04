"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { LIVEPOINT_MODULES, MODULE_LABELS, MODULE_PATHS, type LivePointModule } from "@/lib/livepoint/config";
import { CameraIcon, CarIcon, CloseIcon, CloudSunIcon, FeatherIcon, HeadphonesIcon, MegaphoneIcon } from "../icons";

const EXIT_MS = 200;
const INFO: Record<LivePointModule, { short: string; subtitle: string; detail: string; icon: ReactNode }> = {
  podcast: { short: "Подкаст", subtitle: "Истории с глас", detail: "Всички епизоди", icon: <HeadphonesIcon width={20} height={20} /> },
  weather: { short: "Време", subtitle: "Прогнозата за Пловдив", detail: "Подробна прогноза", icon: <CloudSunIcon width={20} height={20} /> },
  traffic: { short: "Трафик", subtitle: "Пътната обстановка в Пловдив", detail: "Отвори голямата карта", icon: <CarIcon width={20} height={20} /> },
  cameras: { short: "Камери", subtitle: "Поглед към Пловдив и региона", detail: "Всички камери", icon: <CameraIcon width={20} height={20} /> },
  report: { short: "Сигнал", subtitle: "Свържете се с редакцията", detail: "Отвори формата на цял екран", icon: <MegaphoneIcon width={20} height={20} /> },
  "my-news": { short: "Новина", subtitle: "Вашият разказ до редакцията", detail: "Отвори формата на цял екран", icon: <FeatherIcon width={20} height={20} /> },
};

export function MobileLivePointPanel({ module, titleId, panelRef, onClose, onSelect, onDetail, renderContent }: {
  module: LivePointModule | null;
  titleId: string;
  panelRef: RefObject<HTMLDivElement | null>;
  onClose: () => void;
  onSelect: (module: LivePointModule) => void;
  onDetail: (event: MouseEvent<HTMLAnchorElement>) => void;
  renderContent: (module: LivePointModule) => ReactNode;
}) {
  const [retained, setRetained] = useState(module);
  const [visible, setVisible] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const tabs = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: number; y: number; time: number } | null>(null);
  const displayed = module ?? retained;

  useEffect(() => {
    if (module) {
      setRetained(module);
      let second = 0;
      const first = requestAnimationFrame(() => { second = requestAnimationFrame(() => setVisible(true)); });
      return () => { cancelAnimationFrame(first); cancelAnimationFrame(second); };
    }
    setVisible(false);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setRetained(null); return; }
    const timer = setTimeout(() => setRetained(null), EXIT_MS + 50);
    return () => clearTimeout(timer);
  }, [module]);

  useLayoutEffect(() => {
    if (!module) return;
    panelRef.current?.querySelector<HTMLElement>("[data-lp-panel-body]")?.scrollTo({ top: 0 });
    title.current?.focus({ preventScroll: true });
    tabs.current?.querySelector<HTMLElement>('[aria-pressed="true"]')?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [module, panelRef]);

  useEffect(() => {
    if (!displayed || !root.current) return;
    const viewport = window.visualViewport;
    const nav = document.querySelector<HTMLElement>(".np-bottom-nav");
    const header = document.querySelector<HTMLElement>("[data-np-header]");
    const htmlStyle = document.documentElement.style;
    const oldHeight = htmlStyle.getPropertyValue("--np-mobile-lp-visible-height");
    const oldNav = htmlStyle.getPropertyValue("--np-mobile-lp-nav");
    let frame = 0;
    const measure = () => {
      frame = 0;
      const height = viewport?.height ?? window.innerHeight;
      const top = viewport?.offsetTop ?? 0;
      const keyboard = window.innerHeight - height > 150;
      const reserve = keyboard ? 0 : nav?.getBoundingClientRect().height ?? 0;
      const sheetTop = keyboard ? 8 : Math.max(8, (header?.getBoundingClientRect().bottom ?? 96) + 8 - top);
      root.current?.style.setProperty("--np-mobile-lp-height", `${Math.max(0, height - reserve)}px`);
      root.current?.style.setProperty("--np-mobile-lp-viewport-top", `${top}px`);
      root.current?.style.setProperty("--np-mobile-lp-sheet-top", `${sheetTop}px`);
      htmlStyle.setProperty("--np-mobile-lp-visible-height", `${height}px`);
      htmlStyle.setProperty("--np-mobile-lp-nav", `${reserve}px`);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(measure); };
    measure();
    const observer = new ResizeObserver(schedule);
    if (nav) observer.observe(nav, { box: "border-box" });
    if (header) observer.observe(header, { box: "border-box" });
    viewport?.addEventListener("resize", schedule);
    viewport?.addEventListener("scroll", schedule);
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      viewport?.removeEventListener("resize", schedule);
      viewport?.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      if (oldHeight) htmlStyle.setProperty("--np-mobile-lp-visible-height", oldHeight); else htmlStyle.removeProperty("--np-mobile-lp-visible-height");
      if (oldNav) htmlStyle.setProperty("--np-mobile-lp-nav", oldNav); else htmlStyle.removeProperty("--np-mobile-lp-nav");
    };
  }, [displayed]);

  const startDrag = (event: PointerEvent<HTMLElement>) => {
    if (!event.isPrimary || event.button !== 0 || (event.target as HTMLElement).closest("button")) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { id: event.pointerId, y: event.clientY, time: event.timeStamp };
  };
  const moveDrag = (event: PointerEvent<HTMLElement>) => {
    if (drag.current?.id !== event.pointerId || !panelRef.current) return;
    const dy = Math.max(0, event.clientY - drag.current.y);
    panelRef.current.style.transition = "none";
    panelRef.current.style.transform = `translate3d(0, ${dy}px, 0)`;
  };
  const endDrag = (event: PointerEvent<HTMLElement>) => {
    const state = drag.current;
    if (!state || state.id !== event.pointerId) return;
    const dy = Math.max(0, event.clientY - state.y);
    const velocity = dy / Math.max(1, event.timeStamp - state.time);
    drag.current = null;
    if (panelRef.current) { panelRef.current.style.transform = ""; panelRef.current.style.transition = ""; }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (event.type !== "pointercancel" && (dy > 120 || dy > 32 && velocity > .5)) onClose();
  };

  if (!displayed) return null;
  const info = INFO[displayed];
  return createPortal(
    <div ref={root} className="np-mobile-lp-layer" data-visible={!!module && visible} inert={!module} aria-hidden={!module}
      style={{ "--np-mobile-lp-exit": `${EXIT_MS}ms` } as CSSProperties}>
      <button type="button" tabIndex={-1} aria-label="Затвори LivePoint" className="np-mobile-lp-backdrop" onClick={onClose} />
      <div ref={panelRef} role="dialog" aria-labelledby={titleId} className="np-mobile-lp-sheet" data-module={displayed}>
        <header className="np-mobile-lp-header" onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag}>
          <div className="np-mobile-lp-handle" aria-hidden="true"><span /></div>
          <div className="np-mobile-lp-heading">
            <span className="np-mobile-lp-module-icon" aria-hidden="true">{info.icon}</span>
            <div><h2 ref={title} id={titleId} data-autofocus tabIndex={-1}>{MODULE_LABELS[displayed]}</h2><p>{info.subtitle}</p></div>
            <button type="button" aria-label="Затвори" className="np-mobile-lp-close" onClick={onClose}><CloseIcon width={20} height={20} /></button>
          </div>
        </header>
        <div ref={tabs} role="group" aria-label="LivePoint инструменти" className="np-mobile-lp-tabs">
          {LIVEPOINT_MODULES.map(item => <button key={item} type="button" aria-label={MODULE_LABELS[item]} aria-pressed={module === item}
            onClick={() => { if (module !== item) onSelect(item); }}><span aria-hidden="true">{INFO[item].icon}</span><span>{INFO[item].short}</span></button>)}
        </div>
        <div data-lp-panel-body className="np-mobile-lp-body"><div key={displayed} className="np-mobile-lp-content">{renderContent(displayed)}</div></div>
        <footer className="np-mobile-lp-footer"><Link href={MODULE_PATHS[displayed]} onClick={onDetail}>{info.detail}<span aria-hidden="true">↗</span></Link></footer>
      </div>
    </div>, document.body,
  );
}
