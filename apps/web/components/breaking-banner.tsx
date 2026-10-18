"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { BREAKING_CHANGED, BREAKING_SYNC, breakingVisibleAt, type PublicBreaking } from "@newspoint/content";
import "./breaking-banner.css";

function setCss(target: HTMLElement, name: string, value: string) {
  if (target.style.getPropertyValue(name) !== value) target.style.setProperty(name, value);
}

function layoutLeft(element: HTMLElement | null | undefined) {
  let left = 0;
  for (let node = element; node; node = node.offsetParent as HTMLElement | null) left += node.offsetLeft;
  return left;
}

export function BreakingBanner({ initial, categoryPaths }: { initial: PublicBreaking | null; categoryPaths: string[] }) {
  const contentId = useId();
  const pathname = usePathname();
  const eligible = breakingVisibleAt(pathname, categoryPaths);
  const [bulletin, setBulletin] = useState(initial);
  const currentBulletin = useRef(bulletin);
  currentBulletin.current = bulletin;
  const [paused, setPaused] = useState(false);
  const [ready, setReady] = useState(false);
  const [hidden, setHidden] = useState(false);
  const banner = useRef<HTMLDivElement>(null);
  const row = useRef<HTMLDivElement>(null);
  const segment = useRef<HTMLSpanElement>(null);
  const [duration, setDuration] = useState(30);

  useEffect(() => {
    if (!eligible) return;
    let disposed = false;
    let controller: AbortController | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let failures = 0;
    async function sync() {
      if (document.hidden || disposed) return;
      clearTimeout(retry); controller?.abort();
      const request = controller = new AbortController();
      const timeout = setTimeout(() => request.abort(), 10_000);
      try {
        const response = await fetch("/api/breaking/", { cache: "no-store", signal: request.signal });
        if (!response.ok) throw new Error("breaking unavailable");
        const data = await response.json() as { bulletin: PublicBreaking | null };
        if (!disposed && controller === request) { setBulletin(data.bulletin); failures = 0; }
      } catch {
        if (!disposed && controller === request) retry = setTimeout(() => void sync(), Math.min(30_000, 5_000 * 2 ** Math.min(failures++, 3)));
      } finally { clearTimeout(timeout); }
    }
    const update = () => { void sync(); };
    // A linked article can be unpublished or moved independently of this message.
    const publicContentUpdate = () => { if (currentBulletin.current) update(); };
    window.addEventListener(BREAKING_CHANGED, update);
    window.addEventListener(BREAKING_SYNC, update);
    window.addEventListener("online", update);
    document.addEventListener("visibilitychange", update);
    window.addEventListener("np:public-content-updated", publicContentUpdate);
    update();
    return () => {
      disposed = true; controller?.abort(); clearTimeout(retry);
      window.removeEventListener(BREAKING_CHANGED, update); window.removeEventListener(BREAKING_SYNC, update);
      window.removeEventListener("online", update); document.removeEventListener("visibilitychange", update);
      window.removeEventListener("np:public-content-updated", publicContentUpdate);
    };
  }, [eligible]);

  useEffect(() => {
    setReady(true);
    const update = () => setHidden(document.hidden);
    update(); document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);

  useEffect(() => {
    const element = banner.current, content = row.current;
    if (!eligible || !bulletin || !element || !content) return;
    const root = document.documentElement;
    const header = element.closest<HTMLElement>("[data-np-header]");
    const strip = header?.querySelector<HTMLElement>(".np-lp-strip");
    const brand = header?.querySelector<HTMLElement>(".np-lp-brand");
    let disposed = false;
    const measure = () => {
      if (disposed) return;
      const desktop = window.matchMedia("(min-width: 64rem)").matches;
      const latest = header?.querySelector<HTMLElement>(".np-headline-capsule");
      // Read layout offsets, not the temporary FLIP transforms of the rubrics strip.
      const latestRight = layoutLeft(latest) + (latest?.offsetWidth ?? 0) - layoutLeft(element);
      const offset = desktop && latest?.offsetWidth ? Math.max(0, element.clientWidth - latestRight) : 0;
      if (desktop && brand) {
        setCss(element, "--np-breaking-inset", `${layoutLeft(brand) - layoutLeft(strip)}px`);
        setCss(element, "--np-breaking-heading-w", `${brand.getBoundingClientRect().width}px`);
      }
      setCss(element, "--np-breaking-right", `${offset}px`);
      setCss(element, "--np-breaking-window-w", `${element.querySelector<HTMLElement>(".np-breaking-window")?.clientWidth ?? 0}px`);
      setCss(root, "--np-breaking-h", `${content.offsetHeight}px`);
      const width = segment.current?.offsetWidth;
      if (width) setDuration(width / 40);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(content);
    if (strip) observer.observe(strip);
    if (brand) observer.observe(brand);
    const latest = header?.querySelector<HTMLElement>(".np-lp-latest");
    if (latest) observer.observe(latest);
    if (segment.current) observer.observe(segment.current);
    window.addEventListener("resize", measure);
    const mutations = new MutationObserver(measure);
    if (header) mutations.observe(header, { childList: true, subtree: true });
    measure(); void document.fonts.ready.then(measure);
    return () => { disposed = true; observer.disconnect(); mutations.disconnect(); window.removeEventListener("resize", measure); root.style.removeProperty("--np-breaking-h"); };
  }, [eligible, bulletin?.version, paused, ready]);

  if (!eligible || !bulletin) return null;
  const text = <>
    <span id={contentId} className="np-breaking-window">
      <span className="sr-only">{bulletin.text}</span>
      <span className="np-breaking-track" aria-hidden="true" style={{ "--np-breaking-duration": `${duration}s` } as CSSProperties}>
        <span ref={segment} className="np-breaking-segment">{bulletin.text}</span>
        <span className="np-breaking-segment">{bulletin.text}</span>
      </span>
      <span className="np-breaking-static" aria-hidden="true">{bulletin.text}</span>
    </span>
  </>;
  return <div ref={banner} className="np-breaking-host" data-ready={ready || undefined} data-paused={paused || undefined} data-hidden={hidden || undefined}>
    <div ref={row} className="np-breaking" data-rubrics-motion role="region" aria-label="Извънредно съобщение">
      <button type="button" className="np-breaking-heading" onClick={() => setPaused(value => !value)} aria-label={paused ? "Прибери съобщението" : "Разгъни съобщението"} aria-expanded={paused} aria-controls={contentId}>
        <span className="np-breaking-label">ИЗВЪНРЕДНО</span>
        <span className="np-breaking-toggle" aria-hidden="true">
          <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 4 4 4-4 4" /></svg>
        </span>
      </button>
      {bulletin.path ? <Link href={bulletin.path} prefetch={false} className="np-breaking-content">{text}</Link> : <div className="np-breaking-content">{text}</div>}
    </div>
  </div>;
}
