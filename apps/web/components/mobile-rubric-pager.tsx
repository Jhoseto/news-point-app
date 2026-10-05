"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { MobileFeed, type PreviewWindow } from "./mobile-rubric-feed";
import { useReducedMotion } from "./reader-preferences";
import { mobileRubricFeedSchema, type MobileRubricFeed } from "@/lib/mobile-rubric-feed";
import { MobileRubricCache } from "@/lib/mobile-rubric-cache";
import { MobileFeedPositions, type FeedPosition } from "@/lib/mobile-rubric-scroll";
import { MOBILE_OVERLAY_REQUEST } from "@/lib/mobile-overlays";
import { MOBILE_RUBRIC_NAVIGATE, MOBILE_RUBRIC_STATUS, commitSwipe, idlePager, mobileRoutePath, pagerTransition, rubricMenuVersion, rubricNeighbour, rubricRoute, swipeIntent, type MobileRubric, type PagerEvent } from "@/lib/mobile-rubric-nav";

type Visual = { token: number; origin: MobileRubricFeed; target: MobileRubricFeed | null; targetPath: string | null;
  label: string; direction: -1 | 1; top: number; height: number; width: number; originOffset: number; targetOffset: number; distant: boolean;
  originWindow: PreviewWindow };
type Gesture = { id: number; x: number; y: number; time: number; width: number; dx: number; held: number;
  samples: Array<{ x: number; at: number }>; origin: MobileRubricFeed; captured: boolean };
const IGNORE = "[data-mobile-pager-ignore],button,input,textarea,select,option,video,audio,iframe,canvas,[contenteditable],[role='slider'],[role='button'],[role='dialog'],.np-carousel-viewport";

/** This chunk mounts exclusively in MobileChromeIsland. The page remains server rendered and vertically native. */
export function MobileRubricPager() {
  const router = useRouter();
  const reduced = useReducedMotion();
  const motion = useRef(reduced); motion.current = reduced;
  const originFrame = useRef<HTMLDivElement>(null), targetFrame = useRef<HTMLDivElement>(null);
  const [visual, setVisual] = useState<Visual | null>(null);
  const visualRef = useRef<Visual | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const runtime = useRef<{ finishMotion: () => void; retry: () => void } | null>(null);
  useEffect(() => { if (reduced) runtime.current?.finishMotion(); }, [reduced]);

  useEffect(() => {
    const main = document.getElementById("main");
    if (!main) return;
    const cache = new MobileRubricCache();
    let storage: Storage | undefined; try { storage = sessionStorage; } catch {}
    const positions = new MobileFeedPositions(storage);
    const geometry = new Map<string, { version: string; width: number; blocks: Record<string, PreviewWindow[string] & { height: number }> }>();
    let operation = idlePager, token = 0, gesture: Gesture | null = null;
    let model: MobileRubricFeed | null = null, items: MobileRubric[] = [], sourceKey = "", signature = "";
    let queuedTap: string | null = null, routeTimer = 0, animationTimer = 0, paintFrame = 0, readFrame = 0, restoreFrame = 0, idleTimer = 0;
    let pendingRestore: { key: string; fromTop: boolean } | null = location.hash ? { key: location.pathname + location.search + location.hash, fromTop: false } : null;
    let disposed = false, lastDx = 0, clickSuppressedUntil = 0;
    let navigationInput: "swipe" | "tap" = "tap";
    let savedA11y: { inert: boolean; hidden: string | null; busy: string | null } | null = null;
    const oldRestoration = history.scrollRestoration; history.scrollRestoration = "manual";
    const failedImages = new Set<string>();
    const imageError = (event: Event | HTMLImageElement) => {
      const image = event instanceof HTMLImageElement ? event : event.target;
      if (!(image instanceof HTMLImageElement) || !image.closest("[data-mobile-rubric-canonical], [data-mobile-rubric-pager]")) return;
      failedImages.add(image.src); if (image.currentSrc) failedImages.add(image.currentSrc);
      while (failedImages.size > 64) failedImages.delete(failedImages.values().next().value!);
      image.dataset.mobileImageFailed = "true"; image.parentElement?.classList.add("np-mobile-image-fallback");
    };
    const scanImages = () => { for (const image of main.querySelectorAll<HTMLImageElement>("img")) if (image.complete && !image.naturalWidth) imageError(image); };
    const key = () => location.pathname + location.search + location.hash;
    const routePath = () => mobileRoutePath(location.pathname);
    const headerBottom = () => document.querySelector<HTMLElement>("[data-np-header]")?.getBoundingClientRect().bottom ?? 0;
    const currentRoute = () => rubricRoute(location.pathname, items);
    const blocked = () => {
      if (!matchMedia("(max-width: 63.999rem)").matches || document.hidden) return true;
      if (document.querySelector('dialog[open], [role="dialog"]:not([aria-hidden="true"]):not([inert]):not([inert] *)')) return true;
      const focused = document.activeElement;
      if (focused instanceof HTMLElement && focused.matches("input,textarea,select,[contenteditable=true]")) return true;
      if (getSelection()?.toString()) return true;
      return !!visualViewport && visualViewport.height < innerHeight * .7;
    };
    const update = (event: PagerEvent) => {
      operation = pagerTransition(operation, event);
      window.dispatchEvent(new CustomEvent(MOBILE_RUBRIC_STATUS, { detail: { pending: operation.committed && operation.phase !== "idle" ? operation.target : null, phase: operation.phase } }));
    };
    const setView = (value: Visual | null) => { visualRef.current = value; setVisual(value); };
    const savePosition = (allowChangedUrl: unknown = false) => {
      if (!model || (sourceKey !== key() && allowChangedUrl !== true) || visualRef.current) return;
      const top = headerBottom();
      const candidates = [...main.querySelectorAll<HTMLElement>("[data-mobile-feed-anchor]")];
      const anchored = candidates.find(element => (element.firstElementChild ?? element).getBoundingClientRect().bottom > top + 1);
      const active = document.activeElement?.closest<HTMLAnchorElement>("a[href]");
      const position: FeedPosition = { y: scrollY, at: Date.now(),
        ...(anchored ? { anchor: anchored.dataset.mobileFeedAnchor!, offset: (anchored.firstElementChild ?? anchored).getBoundingClientRect().top - top } : {}),
        ...(active && main.contains(active) ? { focus: active.getAttribute("href")! } : {}),
        carousels: [...main.querySelectorAll<HTMLElement>(".np-carousel-viewport")].slice(0, 8).map(element => element.scrollLeft),
      };
      positions.save(sourceKey, position);
    };
    const restore = (destination: string, focusBack = false, immediate = false, fromTop = false) => {
      cancelAnimationFrame(restoreFrame);
      // Fresh rubric selections start at the beginning; only history navigation restores reading progress.
      const value = fromTop ? undefined : positions.get(destination);
      const hash = fromTop ? "" : location.hash;
      const apply = () => {
        restoreFrame = 0;
        if (disposed || key() !== destination || (visualRef.current && !immediate)) return;
        if (hash) {
          let element: HTMLElement | null = null; try { element = document.getElementById(decodeURIComponent(hash.slice(1))); } catch {}
          element?.scrollIntoView(); return;
        }
        let y = value?.y ?? 0;
        if (value?.anchor) {
          const element = [...main.querySelectorAll<HTMLElement>("[data-mobile-feed-anchor]")].find(element => element.dataset.mobileFeedAnchor === value.anchor);
          if (element) y = scrollY + (element.firstElementChild ?? element).getBoundingClientRect().top - headerBottom() - (value.offset ?? 0);
        }
        window.scrollTo({ top: Math.max(0, Math.min(y, document.documentElement.scrollHeight - innerHeight)), behavior: "instant" });
        value?.carousels?.forEach((x, index) => { const element = main.querySelectorAll<HTMLElement>(".np-carousel-viewport")[index]; if (element) element.scrollLeft = x; });
        if (focusBack && value?.focus) [...main.querySelectorAll<HTMLAnchorElement>("a[href]")].find(element => element.getAttribute("href") === value.focus)?.focus({ preventScroll: true });
      };
      if (immediate) apply(); else restoreFrame = requestAnimationFrame(apply);
    };
    const releaseGesture = () => {
      const previous = gesture; gesture = null;
      if (!previous) return;
      clearTimeout(previous.held);
      if (main.hasPointerCapture(previous.id)) main.releasePointerCapture(previous.id);
    };
    const clearVisual = () => {
      clearTimeout(animationTimer); clearTimeout(routeTimer); cancelAnimationFrame(paintFrame);
      animationTimer = 0; routeTimer = 0; paintFrame = 0;
      document.documentElement.removeAttribute("data-mobile-pager-visual");
      if (savedA11y) {
        main.inert = savedA11y.inert;
        if (savedA11y.hidden === null) main.removeAttribute("aria-hidden"); else main.setAttribute("aria-hidden", savedA11y.hidden);
        if (savedA11y.busy === null) main.removeAttribute("aria-busy"); else main.setAttribute("aria-busy", savedA11y.busy);
        savedA11y = null;
      }
      setView(null);
    };
    const configure = (target?: string) => {
      if (!model) return;
      const { index } = rubricRoute(model.canonicalPath, items);
      const paths = [model.canonicalPath, ...(target ? [target] : []), rubricNeighbour(items, index, -1)?.path, rubricNeighbour(items, index, 1)?.path].filter((value): value is string => !!value);
      cache.configure([...new Set(paths)], model.menuVersion); cache.seed(model);
      for (const path of geometry.keys()) if (!paths.slice(0, 3).includes(path)) geometry.delete(path);
    };
    const warmNeighbours = () => {
      clearTimeout(idleTimer);
      const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
      if (connection?.saveData || /(^|-)2g$/.test(connection?.effectiveType ?? "")) return;
      idleTimer = window.setTimeout(() => {
        if (operation.phase !== "idle" || blocked() || !currentRoute().swipe) return;
        configure(); const index = currentRoute().index;
        for (const side of [-1, 1] as const) { const path = rubricNeighbour(items, index, side)?.path; if (path) void cache.load(path).catch(() => {}); }
      }, 1200);
    };
    const finish = () => {
      if (!operation.committed || !operation.motionDone || !operation.routeReady) return;
      const target = operation.target, wasSwipe = navigationInput === "swipe";
      pendingRestore = null; restore(sourceKey, false, true, true);
      clearVisual(); releaseGesture(); update({ type: "reset", token: operation.token }); setNotice(null);
      if (wasSwipe) main.querySelector<HTMLElement>("[data-mobile-feed-heading]")?.focus({ preventScroll: true });
      if (target) setAnnouncement(`${items.find(item => item.path === target)?.name ?? "Новини"} — заредено`);
      configure(); warmNeighbours();
      const queued = queuedTap; queuedTap = null;
      if (queued && queued !== routePath()) requestAnimationFrame(() => navigate(queued, "tap"));
    };
    const finishMotion = () => {
      if (!operation.committed) return;
      update({ type: "motion", token: operation.token });
      if (originFrame.current) { originFrame.current.style.transition = "none"; originFrame.current.style.opacity = "0"; }
      if (targetFrame.current) { targetFrame.current.style.transition = "none"; targetFrame.current.style.transform = "translate3d(0,0,0)"; targetFrame.current.style.opacity = "1"; }
      finish();
    };
    const cancel = (reason = "") => {
      const committed = operation.committed, pendingTarget = operation.target;
      if (reason === "pop" || reason === "external") pendingRestore = null;
      releaseGesture(); clearVisual(); queuedTap = null;
      update({ type: "reset", token: operation.token }); ++token;
      if (committed && pendingTarget && routePath() !== pendingTarget && reason !== "pop" && reason !== "external") {
        // The navigation belongs to Next now. Cancellation never adds a compensating Back entry.
        setNotice("Зареждане на избраната рубрика…");
      } else setNotice(null);
    };
    const readCanonical = () => {
      const script = main.querySelector<HTMLScriptElement>("[data-mobile-rubric-model]");
      if (!script) { model = null; signature = ""; if (operation.phase !== "idle") cancel(); return; }
      const nextSignature = `${location.pathname}:${script.parentElement?.dataset.contentVersion}:${script.parentElement?.dataset.menuVersion}:${script.parentElement?.dataset.freshUntil}`;
      if (signature === nextSignature) {
        sourceKey = key();
        if (pendingRestore?.key === key()) { const pending = pendingRestore; pendingRestore = null; restore(key(), !pending.fromTop, false, pending.fromTop); }
        return;
      }
      let next: MobileRubricFeed;
      try { next = mobileRubricFeedSchema.parse(JSON.parse(script.textContent ?? "null")); } catch { return; }
      if (next.canonicalPath !== routePath()) return;
      const nextItems = [...document.querySelectorAll<HTMLAnchorElement>(".np-mobile-rubric-tabs a")].map(element => ({ path: element.getAttribute("href")!, name: element.textContent?.trim() ?? "" }));
      if (!nextItems.length) {
        model = next; sourceKey = key(); signature = nextSignature; items = [];
        if (operation.committed && operation.target === next.canonicalPath) { update({ type: "ready", token: operation.token }); finish(); }
        else if (operation.phase !== "idle") cancel("external");
        cache.clear(); return;
      }
      if (rubricMenuVersion(nextItems) !== next.menuVersion) return;
      if (model && model.menuVersion !== next.menuVersion && !operation.committed && operation.phase !== "idle") cancel();
      const changed = !model || model.canonicalPath !== next.canonicalPath || model.contentVersion !== next.contentVersion || model.menuVersion !== next.menuVersion;
      signature = nextSignature; items = nextItems; model = next; sourceKey = key();
      if (changed) scanImages();
      if (changed && operation.phase === "idle") { configure(); warmNeighbours(); setNotice(null); }
      if (operation.committed && operation.target === next.canonicalPath) {
        // Mounted public model is the readiness gate; a pathname change alone is insufficient.
        update({ type: "ready", token: operation.token }); finish();
      } else if (operation.phase === "idle" && pendingRestore?.key === sourceKey) { const pending = pendingRestore; pendingRestore = null; restore(sourceKey, !pending.fromTop, false, pending.fromTop); }
    };
    const paint = (dx: number) => {
      lastDx = dx;
      if (paintFrame) return;
      paintFrame = requestAnimationFrame(() => {
        paintFrame = 0;
        if (!visualRef.current || operation.committed || motion.current) return;
        if (originFrame.current) originFrame.current.style.transform = `translate3d(${lastDx}px,0,0)`;
        if (targetFrame.current) targetFrame.current.style.transform = `translate3d(${lastDx + visualRef.current.direction * visualRef.current.width}px,0,0)`;
      });
    };
    const showVisual = (origin: MobileRubricFeed, targetPath: string | null, direction: -1 | 1, distant = false) => {
      const top = headerBottom(), bottom = document.querySelector<HTMLElement>("[data-np-bottom-nav]")?.getBoundingClientRect().top ?? document.querySelector<HTMLElement>(".np-bottom-nav")?.getBoundingClientRect().top ?? innerHeight;
      const width = main.getBoundingClientRect().width;
      const mainBox = main.getBoundingClientRect();
      const measured = gesture?.captured && visualRef.current?.token === operation.token ? geometry.get(origin.canonicalPath)?.blocks : undefined;
      const blocks: Record<string, PreviewWindow[string] & { height: number }> = measured ?? {};
      // Reversing direction within this gesture reuses the same native-page measurements.
      if (!measured) for (const element of main.querySelectorAll<HTMLElement>("[data-mobile-preview-block]")) {
        if (element.parentElement?.closest("[data-mobile-preview-block]")) continue;
        let boxElement: Element = element;
        while (!boxElement.getClientRects().length && boxElement.firstElementChild) boxElement = boxElement.firstElementChild;
        const box = boxElement.getBoundingClientRect();
        blocks[element.dataset.mobilePreviewBlock!] = { top: box.top - mainBox.top, left: box.left - mainBox.left, width: box.width, height: box.height };
        const carousel = element.querySelector<HTMLElement>(".np-carousel-viewport"), card = carousel?.querySelector<HTMLElement>("[data-carousel-card]");
        if (carousel && card) {
          const step = card.getBoundingClientRect().width + (Number.parseFloat(getComputedStyle(card.parentElement!).columnGap) || 0);
          const count = card.parentElement?.children.length ?? 0;
          if (step > 0 && count > 0) blocks[element.dataset.mobilePreviewBlock!]!.carousel = { index: Math.floor(carousel.scrollLeft / step) % count, offset: carousel.scrollLeft % step };
        }
      }
      geometry.set(origin.canonicalPath, { version: origin.contentVersion, width, blocks });
      const windowAt = (value: typeof blocks, y: number) => Object.fromEntries(Object.entries(value).filter(([, box]) => box.top + box.height > y && box.top < y + (bottom - top)));
      // The opaque viewport compositor covers the original page. Keeping its
      // subtree untouched during tracking avoids restyling thousands of nodes.
      document.documentElement.setAttribute("data-mobile-pager-visual", "");
      setView({ token: operation.token, origin, target: targetPath ? cache.get(targetPath) ?? null : null, targetPath,
        label: items.find(item => item.path === targetPath)?.name ?? "Новини", direction, top, height: Math.max(0, bottom - top), width,
        originOffset: mainBox.top - top, targetOffset: 0, distant, originWindow: windowAt(blocks, top - mainBox.top) });
      if (targetPath) void cache.load(targetPath).then(target => {
        const current = visualRef.current;
        if (current && current.token === operation.token && current.targetPath === targetPath && !gesture?.captured) setView({ ...current, target });
      }).catch(() => { /* RSC navigation remains authoritative; skeleton needs no private fallback. */ });
    };
    const animate = (commit: boolean) => {
      const current = visualRef.current;
      if (!current) { if (commit) finishMotion(); return; }
      cancelAnimationFrame(paintFrame); paintFrame = 0;
      const ms = motion.current ? 0 : current.distant ? 150 : commit ? 250 : 200;
      const from = originFrame.current, to = targetFrame.current;
      const css = ms ? `${current.distant ? "opacity" : "transform"} ${ms}ms cubic-bezier(.22,1,.36,1)` : "none";
      if (from) { from.style.transition = css; from.style.willChange = current.distant ? "opacity" : "transform";
        if (current.distant || motion.current) from.style.opacity = commit ? "0" : "1";
        else from.style.transform = `translate3d(${commit ? -current.direction * current.width : 0}px,0,0)`; }
      if (to) { to.style.transition = css; to.style.willChange = current.distant ? "opacity" : "transform";
        if (current.distant || motion.current) to.style.opacity = commit ? "1" : "0";
        else to.style.transform = `translate3d(${commit ? 0 : current.direction * current.width}px,0,0)`; }
      const owned = operation.token;
      clearTimeout(animationTimer);
      animationTimer = window.setTimeout(() => {
        if (operation.token !== owned) return;
        if (commit) finishMotion(); else { clearVisual(); update({ type: "reset", token: owned }); configure(); warmNeighbours(); }
      }, ms ? ms + 40 : 0);
    };
    const commit = (path: string, input: "swipe" | "tap") => {
      if (operation.committed || (operation.phase !== "tracking" && operation.phase !== "dragging")) return;
      navigationInput = input; releaseGesture(); update({ type: "commit", token: operation.token, target: path });
      pendingRestore = { key: path, fromTop: true };
      if (!savedA11y) { savedA11y = { inert: main.inert, hidden: main.getAttribute("aria-hidden"), busy: main.getAttribute("aria-busy") }; main.inert = true; main.setAttribute("aria-hidden", "true"); main.setAttribute("aria-busy", "true"); }
      // Exactly one push at settling start. Router navigation has no awaitable readiness promise.
      router.push(path, { scroll: false });
      animate(true);
      const owned = operation.token;
      routeTimer = window.setTimeout(() => {
        if (operation.token === owned && !operation.routeReady) { finishMotion(); setNotice("Зареждането се забави. Можете да опитате отново."); }
      }, 10_000);
    };
    const navigate = (path: string, input: "swipe" | "tap") => {
      if (!items.some(item => item.path === path) || path === routePath() || blocked()) return;
      if (operation.committed) { queuedTap = path; return; }
      if (operation.phase !== "idle") cancel();
      if (!model || !currentRoute().swipe) { savePosition(); pendingRestore = { key: path, fromTop: true }; router.push(path, { scroll: false }); return; }
      savePosition(); update({ type: "track", token: ++token }); configure(path);
      const from = currentRoute().index, index = items.findIndex(item => item.path === path);
      const direction = index > from ? 1 : -1;
      showVisual(model, path, direction, Math.abs(index - from) > 1);
      update({ type: "drag", token: operation.token, target: path });
      // Mount the initial compositor frame before beginning the CSS transition.
      paintFrame = requestAnimationFrame(() => { paintFrame = requestAnimationFrame(() => { paintFrame = 0; if (visualRef.current?.token === operation.token) commit(path, input); }); });
    };
    const down = (event: PointerEvent) => {
      if (gesture && event.pointerId !== gesture.id) { cancel(); return; }
      if (main.inert || operation.phase !== "idle" || !event.isPrimary || event.button !== 0 || !model || !currentRoute().swipe || blocked()) return;
      if (event.clientX < 24 || event.clientX > innerWidth - 24 || event.composedPath().some(element => element instanceof HTMLElement && element.matches(IGNORE))) return;
      savePosition(); update({ type: "track", token: ++token });
      gesture = { id: event.pointerId, x: event.clientX, y: event.clientY, time: event.timeStamp, width: main.getBoundingClientRect().width,
        dx: 0, samples: [{ x: event.clientX, at: event.timeStamp }], origin: model, captured: false,
        held: window.setTimeout(() => { if (gesture && !gesture.captured) cancel(); }, 350) };
    };
    const move = (event: PointerEvent) => {
      const current = gesture;
      if (!current || current.id !== event.pointerId) return;
      if (blocked()) { cancel(); return; }
      const dx = event.clientX - current.x, dy = event.clientY - current.y;
      if (!current.captured) {
        const intent = swipeIntent(dx, dy, event.timeStamp - current.time);
        if (intent === "cancel") { cancel(); return; }
        if (intent === "wait") return;
        current.captured = true; clearTimeout(current.held);
        try { main.setPointerCapture(current.id); } catch {}
      }
      event.preventDefault(); current.dx = dx;
      current.samples.push({ x: event.clientX, at: event.timeStamp });
      current.samples = current.samples.filter(sample => event.timeStamp - sample.at <= 80).slice(-12);
      const direction = dx < 0 ? 1 : -1, target = rubricNeighbour(items, currentRoute().index, direction)?.path ?? null;
      if (!visualRef.current || visualRef.current.targetPath !== target) { configure(target ?? undefined); showVisual(current.origin, target, direction); update({ type: "drag", token: operation.token, target }); }
      const distance = target ? Math.max(-current.width, Math.min(current.width, dx)) : Math.sign(dx) * Math.min(24, Math.abs(dx) * .12);
      paint(distance);
    };
    const up = (event: PointerEvent) => {
      const current = gesture;
      if (!current || event.pointerId !== current.id) return;
      if (!current.captured) { cancel(); return; }
      const dx = event.clientX - current.x;
      const first = current.samples[0];
      const velocity = first && event.timeStamp > first.at && event.timeStamp - first.at <= 100 ? (event.clientX - first.x) / (event.timeStamp - first.at) : 0;
      clickSuppressedUntil = performance.now() + 400;
      const target = dx < 0 ? rubricNeighbour(items, currentRoute().index, 1)?.path : rubricNeighbour(items, currentRoute().index, -1)?.path;
      releaseGesture();
      if (target && commitSwipe(dx, current.width, velocity)) { commit(target, "swipe"); }
      else animate(false);
    };
    const cancelled = (event: PointerEvent) => {
      // Touch has implicit capture on the original article/image. Its transfer to
      // main emits a bubbling lostpointercapture; only losing our own capture cancels.
      if (event.type === "lostpointercapture" && event.target !== main) return;
      if (gesture?.id === event.pointerId) cancel();
    };
    const click = (event: MouseEvent) => {
      if (performance.now() < clickSuppressedUntil && main.contains(event.target as Node)) { event.preventDefault(); event.stopPropagation(); return; }
      if (main.contains(event.target as Node) && (event.target as Element).closest("a[href]")) savePosition();
      const link = (event.target as Element).closest<HTMLAnchorElement>("a[href]");
      if (operation.phase !== "idle" && link && !link.closest(".np-mobile-rubric-tabs") && !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey && event.button === 0) cancel("external");
    };
    const tab = (event: Event) => {
      const path = (event as CustomEvent<string>).detail;
      if (items.some(item => item.path === path) && !blocked()) { event.preventDefault(); navigate(path, "tap"); }
    };
    const pop = () => { savePosition(true); cancel("pop"); pendingRestore = { key: key(), fromTop: false }; readCanonical(); };
    const manualScroll = () => {
      cancelAnimationFrame(restoreFrame); restoreFrame = 0;
      // Input on the outgoing page must not drop the start-at-top intent of a pending route.
      if (!pendingRestore?.fromTop || pendingRestore.key === key()) pendingRestore = null;
    };
    const interrupt = () => { if (operation.phase !== "idle") cancel(); };
    const overlay = () => interrupt();
    const visibility = () => { if (document.hidden) interrupt(); };
    const refresh = () => { cache.clear(); if (operation.phase === "idle") warmNeighbours(); };
    const observer = new MutationObserver(() => {
      for (const image of document.querySelectorAll<HTMLImageElement>("[data-mobile-rubric-pager] img")) if (failedImages.has(image.src) || failedImages.has(image.currentSrc)) imageError(image);
      if (blocked() && operation.phase !== "idle") interrupt();
      if (readFrame) return;
      readFrame = requestAnimationFrame(() => { readFrame = 0; readCanonical(); });
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-content-version", "data-menu-version", "data-fresh-until", "open"] });
    main.addEventListener("pointerdown", down);
    window.addEventListener("pointerdown", eventSecondPointer, true);
    function eventSecondPointer(event: PointerEvent) { if (gesture && event.pointerId !== gesture.id) cancel(); }
    main.addEventListener("pointermove", move, { passive: false });
    main.addEventListener("pointerup", up); main.addEventListener("pointercancel", cancelled); main.addEventListener("lostpointercapture", cancelled);
    document.addEventListener("click", click, true); document.addEventListener("contextmenu", interrupt); document.addEventListener("selectionchange", selectionChanged);
    const failedImage = (event: Event) => imageError(event);
    const loadedImage = (event: Event) => {
      const image = event.target;
      if (!(image instanceof HTMLImageElement) || !image.closest("[data-mobile-rubric-canonical], [data-mobile-rubric-pager]")) return;
      failedImages.delete(image.src); failedImages.delete(image.currentSrc);
      delete image.dataset.mobileImageFailed; image.parentElement?.classList.remove("np-mobile-image-fallback");
    };
    document.addEventListener("error", failedImage, true);
    document.addEventListener("load", loadedImage, true);
    function selectionChanged() { if (getSelection()?.toString()) interrupt(); }
    window.addEventListener(MOBILE_RUBRIC_NAVIGATE, tab);
    window.addEventListener(MOBILE_OVERLAY_REQUEST, overlay);
    window.addEventListener("popstate", pop); window.addEventListener("resize", interrupt); window.addEventListener("orientationchange", interrupt);
    window.addEventListener("blur", interrupt); document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pagehide", savePosition); window.addEventListener("wheel", manualScroll, { passive: true });
    window.addEventListener("touchstart", manualScroll, { passive: true });
    window.addEventListener("np:public-content-updated", refresh);
    runtime.current = { finishMotion: () => { if (operation.committed) finishMotion(); else if (operation.phase !== "idle") cancel(); }, retry: () => {
      setNotice(null);
      if (operation.committed && operation.target && routePath() !== operation.target) router.push(operation.target, { scroll: false });
      else router.refresh();
      readCanonical();
    } };
    readCanonical();
    return () => {
      disposed = true; releaseGesture(); clearVisual(); cache.clear(); observer.disconnect();
      for (const frame of [readFrame, restoreFrame, paintFrame]) cancelAnimationFrame(frame);
      clearTimeout(idleTimer); history.scrollRestoration = oldRestoration;
      main.removeEventListener("pointerdown", down); window.removeEventListener("pointerdown", eventSecondPointer, true);
      main.removeEventListener("pointermove", move); main.removeEventListener("pointerup", up); main.removeEventListener("pointercancel", cancelled); main.removeEventListener("lostpointercapture", cancelled);
      document.removeEventListener("click", click, true); document.removeEventListener("contextmenu", interrupt); document.removeEventListener("selectionchange", selectionChanged);
      document.removeEventListener("error", failedImage, true);
      document.removeEventListener("load", loadedImage, true);
      window.removeEventListener(MOBILE_RUBRIC_NAVIGATE, tab); window.removeEventListener(MOBILE_OVERLAY_REQUEST, overlay);
      window.removeEventListener("popstate", pop); window.removeEventListener("resize", interrupt); window.removeEventListener("orientationchange", interrupt);
      window.removeEventListener("blur", interrupt); document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pagehide", savePosition); window.removeEventListener("wheel", manualScroll); window.removeEventListener("touchstart", manualScroll);
      window.removeEventListener("np:public-content-updated", refresh); runtime.current = null;
      window.dispatchEvent(new CustomEvent(MOBILE_RUBRIC_STATUS, { detail: { pending: null, phase: "idle" } }));
    };
  }, [router]);

  return createPortal(<>
    {visual ? <div className="np-mobile-pager-layer" data-mobile-rubric-pager aria-hidden="true" inert style={{ top: visual.top, height: visual.height }}>
      <div ref={originFrame} className="np-mobile-pager-frame" style={{ transform: "translate3d(0,0,0)", willChange: "transform" }}>
        <div className="np-mobile-pager-content" style={{ transform: `translateY(${visual.originOffset}px)` }}><MobileFeed model={visual.origin} preview namespace={`preview-origin-${visual.token}`} window={visual.originWindow} /></div>
      </div>
      {visual.targetPath ? <div ref={targetFrame} className="np-mobile-pager-frame" style={{ transform: motion.current || visual.distant ? "translate3d(0,0,0)" : `translate3d(${visual.direction * visual.width}px,0,0)`, opacity: motion.current || visual.distant ? 0 : 1, willChange: visual.distant ? "opacity" : "transform" }}>
        {visual.target ? <div className="np-mobile-pager-content" style={{ transform: `translateY(${visual.targetOffset}px)` }}><MobileFeed model={firstScreen(visual.target)} preview namespace={`preview-target-${visual.token}`} /></div> : <div className="np-mobile-pager-skeleton"><span>{visual.label}</span><i /><i /><i /><i /></div>}
      </div> : null}
    </div> : null}
    {notice ? <div className="np-mobile-pager-notice" role="status"><span>{notice}</span><button type="button" onClick={() => runtime.current?.retry()}>Опитай отново</button></div> : null}
    <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">{announcement}</span>
  </>, document.body);
}

/** Unvisited previews render enough real stories for the first screen, not an entire second page. */
function firstScreen(model: MobileRubricFeed): MobileRubricFeed {
  if (model.feed.kind === "category") return { ...model, feed: { ...model.feed, articles: model.feed.articles.slice(0, 8), previous: null, next: null } };
  const hasLeading = !!model.feed.hero || !!model.feed.support.length;
  return { ...model, feed: { ...model.feed, main: hasLeading ? [] : model.feed.main.slice(0, 1), aside: hasLeading ? [] : model.feed.aside.slice(0, 1),
    focusCarousel: hasLeading ? [] : model.feed.focusCarousel.slice(0, 4), topicsCarousel: [], voiceCarousel: [], poll: null } };
}
