"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { isLivePointModule, MODULE_LABELS, MODULE_PATHS, type LivePointModule } from "@/lib/livepoint/config";
import type { DataEnvelope, LatestHeadline, WeatherForecast } from "@/lib/livepoint/types";
import { CloseIcon } from "../icons";
import { CamerasPanel } from "./cameras-panel";
import { MyNewsPanel } from "./my-news-panel";
import { ReportPanel } from "./report-panel";
import { TrafficPanel } from "./traffic-panel";
import { PodcastPanel } from "../podcast/show";
import { PodcastOrbit } from "../podcast/visuals";
import { podcastPanelPlace } from "@/lib/podcast-playback";
import { WeatherPanel } from "./weather-panel";
import { MOBILE_OVERLAY_CHANGE, MOBILE_OVERLAY_REQUEST, requestMobileOverlay, type MobileOverlay } from "@/lib/mobile-overlays";

const MobileLivePointPanel = dynamic(() => import("./mobile-livepoint-panel").then(module => module.MobileLivePointPanel), { ssr: false });

export type LivePointData = {
  weather: DataEnvelope<WeatherForecast>;
  trafficConnected: boolean;
  camerasLiveLabel: boolean;
  latest: LatestHeadline | null;
};

type LivePointContextValue = LivePointData & {
  active: LivePointModule | null;
  open: (module: LivePointModule) => void;
  close: () => void;
};

const LivePointContext = createContext<LivePointContextValue | null>(null);

export function useLivePoint(): LivePointContextValue {
  const value = useContext(LivePointContext);
  if (!value) throw new Error("useLivePoint must be used inside <LivePointProvider>");
  return value;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const PANEL_MAX: Record<LivePointModule, number> = {
  weather: 768,
  traffic: 1216,
  cameras: 672,
  report: 896,
  "my-news": 896,
  podcast: 880,
};

type PanelPlace = { top: number; left: number; width: number; arrow: number };

function placePanel(module: LivePointModule): PanelPlace | null {
  const button = document.querySelector<HTMLElement>(`[data-lp-module="${module}"]`);
  if (!button) return null;
  const rect = button.getBoundingClientRect();
  if (module === "podcast") return { top: rect.bottom + 10, ...podcastPanelPlace(window.innerWidth, rect.left, rect.width) };
  const margin = 12;
  const left = rect.left;
  const width = Math.min(PANEL_MAX[module], Math.max(160, window.innerWidth - left - margin));
  return { top: rect.bottom + 10, left, width, arrow: Math.min(width - 18, Math.max(18, rect.width / 2)) };
}

const DETAIL_LABELS: Record<LivePointModule, string> = {
  weather: "Подробности за времето",
  traffic: "Подробности за трафика",
  cameras: "Всички камери",
  report: "Страница за подаване на сигнал",
  "my-news": "Страница за моята новина",
  podcast: "Всички епизоди",
};

const PANEL_SUBTITLES: Record<LivePointModule, string> = {
  weather: "Пловдив · прогноза",
  traffic: "Пловдив · пътна обстановка",
  cameras: "Пловдив и регион",
  report: "Сигнал до редакцията",
  "my-news": "Материал за редакцията",
  podcast: "Гласът на истината",
};

function writeQuery(module: LivePointModule | null, mode: "push" | "replace" = "replace") {
  const url = new URL(window.location.href);
  if (module) url.searchParams.set("livepoint", module);
  else url.searchParams.delete("livepoint");
  const next = `${url.pathname}${url.search}${url.hash}`;
  if (`${window.location.pathname}${window.location.search}${window.location.hash}` !== next) {
    const state = mode === "push" ? { ...window.history.state, npLivePoint: true } : window.history.state;
    window.history[mode === "push" ? "pushState" : "replaceState"](state, "", next);
  }
}

function queryModule(): LivePointModule | null {
  const value = new URLSearchParams(window.location.search).get("livepoint");
  return isLivePointModule(value) ? value : null;
}

/** Keeps the page still without the jump of `position: fixed` on body. */
function useScrollLock(locked: boolean) {
  useEffect(() => {
    if (!locked) return;
    const { style } = document.documentElement;
    const previousOverflow = style.overflow;
    const previousPadding = style.paddingRight;
    const gutter = window.innerWidth - document.documentElement.clientWidth;
    style.overflow = "hidden";
    if (gutter > 0) style.paddingRight = `${gutter}px`;
    return () => {
      style.overflow = previousOverflow;
      style.paddingRight = previousPadding;
    };
  }, [locked]);
}

export function LivePointProvider({
  children,
  weather,
  trafficConnected,
  camerasLiveLabel,
  latest,
}: LivePointData & { children: ReactNode }) {
  const pathname = usePathname();
  const titleId = useId();
  const [active, setActive] = useState<LivePointModule | null>(null);
  const [place, setPlace] = useState<PanelPlace | null>(null);
  const [dirty, setDirty] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [mobile, setMobile] = useState(false);
  const opener = useRef<HTMLElement | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const dirtyRef = useRef(false);
  const activeRef = useRef<LivePointModule | null>(null);
  dirtyRef.current = dirty;
  activeRef.current = active;

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 63.999rem)");
    const update = () => setMobile(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    setActive(queryModule());
    setDirty(false);
  }, [pathname]);

  useEffect(() => {
    const onPop = () => {
      const next = queryModule();
      if (dirtyRef.current && next !== activeRef.current && !window.confirm("Имате незапазен текст. Да напусна панела?")) {
        window.history.go(1);
        return;
      }
      activeRef.current = next;
      setActive(next);
      setDirty(false);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const close = useCallback(() => {
    if (dirtyRef.current && !window.confirm("Имате незапазен текст. Да затворя панела?")) return;
    const ownedHistoryEntry = window.history.state?.npLivePoint === true;
    activeRef.current = null;
    setActive(null);
    setDirty(false);
    if (ownedHistoryEntry) window.history.back();
    else writeQuery(null);
    const back = opener.current;
    opener.current = null;
    if (back?.isConnected) queueMicrotask(() => back.focus({ preventScroll: true }));
  }, []);

  const open = useCallback((module: LivePointModule) => {
    const current = activeRef.current;
    if (current === module) {
      close();
      return;
    }
    if (!requestMobileOverlay("livepoint")) return;
    if (current && dirtyRef.current && !window.confirm("Имате незапазен текст. Да сменя панела?")) return;
    if (current === null) opener.current = document.activeElement as HTMLElement | null;
    activeRef.current = module;
    setActive(module);
    setDirty(false);
    writeQuery(module, current === null ? "push" : "replace");
  }, [close]);

  useEffect(() => {
    if (!mobile) return;
    const switchPanel = (event: Event) => {
      if ((event as CustomEvent<MobileOverlay>).detail === "livepoint" || !activeRef.current) return;
      if (dirtyRef.current && !window.confirm("Имате незапазен текст. Да напусна панела?")) { event.preventDefault(); return; }
    };
    const finishSwitch = (event: Event) => {
      if ((event as CustomEvent<MobileOverlay>).detail === "livepoint" || !activeRef.current) return;
      // A mobile handoff must not navigate Back and close the new sheet.
      dirtyRef.current = false;
      activeRef.current = null;
      setActive(null);
      setDirty(false);
      opener.current = null;
      writeQuery(null);
      if (window.history.state?.npLivePoint) {
        const state = { ...window.history.state };
        delete state.npLivePoint;
        window.history.replaceState(state, "");
      }
    };
    window.addEventListener(MOBILE_OVERLAY_REQUEST, switchPanel);
    window.addEventListener(MOBILE_OVERLAY_CHANGE, finishSwitch);
    return () => {
      window.removeEventListener(MOBILE_OVERLAY_REQUEST, switchPanel);
      window.removeEventListener(MOBILE_OVERLAY_CHANGE, finishSwitch);
    };
  }, [mobile]);

  useScrollLock(active !== null);

  useEffect(() => {
    if (!active || mobile) return;
    const measure = () => setPlace(placePanel(active));
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [active, mobile]);

  useEffect(() => {
    if (!active) return;
    const onKey = (event: KeyboardEvent) => {
      // The native location dialog is in the top layer and owns focus/Escape while open.
      if (event.target instanceof Element && event.target.closest("[data-report-location-dialog]")) return;
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== "Tab" || !panel.current) return;
      const items = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE),
        ...(mobile ? document.querySelectorAll<HTMLElement>(`.np-bottom-nav ${FOCUSABLE.split(", ").join(", .np-bottom-nav ")}`) : [])]
        .filter((item) => item.offsetParent !== null);
      const first = items[0];
      const last = items.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && (document.activeElement === first || active === "podcast" && document.activeElement?.hasAttribute("data-autofocus"))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [active, close, mobile]);

  useEffect(() => {
    if (!active || !panel.current || mobile) return;
    panel.current.querySelector<HTMLElement>("[data-lp-panel-body]")?.scrollTo({ top: 0 });
    const target =
      panel.current.querySelector<HTMLElement>("[data-autofocus]") ?? panel.current.querySelector<HTMLElement>(FOCUSABLE);
    target?.focus({ preventScroll: true });
  }, [active, mobile]);

  const value = useMemo<LivePointContextValue>(
    () => ({ weather, trafficConnected, camerasLiveLabel, latest, active, open, close }),
    [weather, trafficConnected, camerasLiveLabel, latest, active, open, close],
  );

  return (
    <LivePointContext.Provider value={value}>
      {children}
      {mobile && mounted ? <MobileLivePointPanel module={active} titleId={titleId} panelRef={panel} onClose={close} onSelect={open}
        onDetail={(event) => {
          if (dirtyRef.current && !window.confirm("Имате незапазен текст. Да отворя подробната страница?")) event.preventDefault();
        }}
        renderContent={(module) => <>
          {module === "weather" ? <WeatherPanel initial={weather} mobile /> : null}
          {module === "traffic" ? <TrafficPanel connected={trafficConnected} /> : null}
          {module === "cameras" ? <CamerasPanel variant="panel" /> : null}
          {module === "report" ? <ReportPanel onDirtyChange={setDirty} /> : null}
          {module === "my-news" ? <MyNewsPanel onDirtyChange={setDirty} /> : null}
          {module === "podcast" ? <PodcastPanel /> : null}
        </>}
      /> : null}
      {active && mounted && !mobile
        ? createPortal(
            <div className="np-lp-layer pointer-events-none fixed inset-0 z-50">
              <button
                type="button"
                aria-label="Затвори LivePoint"
                tabIndex={-1}
                className="np-lp-scrim pointer-events-auto fixed inset-x-0 top-[var(--np-header-h)] bottom-0 cursor-default backdrop-blur-md lg:left-[var(--np-rail-w)]"
                onClick={close}
              />
              <div
                className={`np-lp-pop pointer-events-auto ${active === "podcast" ? "np-podcast-pop" : ""}`}
                style={place ? { top: place.top, left: place.left, width: place.width, transformOrigin: `${place.arrow}px 0` } : { top: "var(--np-header-h)", left: 12, right: 12, width: "auto" }}
              >
              <span className="np-lp-pop-arrow" style={place ? { left: place.arrow } : undefined} aria-hidden="true" />
              <div
                ref={panel}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                className={`np-lp-panel np-card relative flex w-full min-w-0 flex-col overflow-hidden ${active === "podcast" ? "np-podcast-panel" : active === "traffic" ? "np-lp-traffic" : active === "report" || active === "my-news" ? "np-lp-submission-panel" : ""}`}
                style={{ maxHeight: place ? `calc(100dvh - ${place.top + 16}px)` : "min(78dvh, 44rem)" }}
              >
                <div className={`flex shrink-0 items-center gap-3 border-b border-line px-4 py-3 sm:px-5 ${active === "traffic" ? "sm:py-3" : "sm:py-4"}`}>
                  <h2
                    id={titleId}
                    data-autofocus
                    tabIndex={-1}
                    className="flex min-w-0 flex-1 items-center gap-2.5 text-lg font-extrabold tracking-tight text-ink outline-none"
                  >
                    {active === "podcast" ? <PodcastOrbit className="np-podcast-mark" /> : <span className="np-ring" aria-hidden="true" />}
                    {MODULE_LABELS[active]}
                  </h2>
                  <span className="hidden text-xs font-semibold text-muted sm:inline">{PANEL_SUBTITLES[active]}</span>
                  {active === "traffic" && <Link href={MODULE_PATHS.traffic} aria-label="Подробности за трафика" className="inline-flex shrink-0 rounded-full border border-accent/30 bg-surface-2 px-3 py-2 text-xs font-extrabold text-link transition-colors hover:border-accent hover:bg-accent hover:text-on-accent sm:px-4"><span className="sm:hidden">Още ↗</span><span className="hidden sm:inline">Подробности за трафика ↗</span></Link>}
                  <button
                    type="button"
                    aria-label="Затвори"
                    onClick={close}
                    className={`inline-flex ${active === "podcast" ? "size-11" : "size-10"} shrink-0 items-center justify-center rounded-full border border-line bg-surface-2 text-muted transition-colors hover:text-ink`}
                  >
                    <CloseIcon width={18} height={18} />
                  </button>
                </div>
                <div data-lp-panel-body className={`${active === "podcast" ? "np-podcast-panel-body min-h-0 flex-1" : active === "traffic" ? "min-h-0 flex-1 overflow-hidden px-2.5 py-2.5 sm:px-4 sm:py-3" : "np-scroll-soft min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5 sm:py-5"}`}>
                  {active === "weather" ? <WeatherPanel initial={weather} /> : null}
                  {active === "traffic" ? <TrafficPanel connected={trafficConnected} /> : null}
                  {active === "cameras" ? <CamerasPanel variant="panel" /> : null}
                  {active === "report" ? <ReportPanel onDirtyChange={setDirty} /> : null}
                  {active === "my-news" ? <MyNewsPanel onDirtyChange={setDirty} /> : null}
                  {active === "podcast" ? <PodcastPanel /> : null}
                </div>
                {active !== "traffic" && <div className="flex shrink-0 justify-end border-t border-line px-4 py-3 sm:px-5">
                  <Link
                    href={MODULE_PATHS[active]}
                    onClick={(event) => {
                      if (dirtyRef.current && !window.confirm("Имате незапазен текст. Да отворя подробната страница?")) {
                        event.preventDefault();
                      }
                    }}
                    className="text-sm font-bold text-link transition-colors hover:text-logo"
                  >
                    {DETAIL_LABELS[active]} <span aria-hidden="true">→</span>
                  </Link>
                </div>}
              </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </LivePointContext.Provider>
  );
}
