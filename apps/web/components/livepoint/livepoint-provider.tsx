"use client";

import Link from "next/link";
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
import { WeatherPanel } from "./weather-panel";

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

const PANEL_WIDTH: Record<LivePointModule, string> = {
  weather: "max-w-3xl",
  traffic: "max-w-[76rem]",
  cameras: "max-w-2xl",
  report: "max-w-4xl",
  "my-news": "max-w-4xl",
};

const DETAIL_LABELS: Record<LivePointModule, string> = {
  weather: "Подробности за времето",
  traffic: "Подробности за трафика",
  cameras: "Всички камери",
  report: "Страница за подаване на сигнал",
  "my-news": "Страница за моята новина",
};

const PANEL_SUBTITLES: Record<LivePointModule, string> = {
  weather: "Пловдив · прогноза",
  traffic: "Пловдив · пътна обстановка",
  cameras: "Пловдив и регион",
  report: "Сигнал до редакцията",
  "my-news": "Материал за редакцията",
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

/** Header shrinks on scroll, but stays full while a panel is open (DEC-119). */
function useHeaderCompact(locked: boolean) {
  useEffect(() => {
    const header = document.querySelector("[data-np-header]");
    const root = document.documentElement;
    if (locked) {
      header?.removeAttribute("data-compact");
      root.removeAttribute("data-np-compact");
      return;
    }
    const onScroll = () => {
      const compact = window.scrollY > 48;
      header?.toggleAttribute("data-compact", compact);
      root.toggleAttribute("data-np-compact", compact);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
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
  const [dirty, setDirty] = useState(false);
  const [mounted, setMounted] = useState(false);
  const opener = useRef<HTMLElement | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const dirtyRef = useRef(false);
  const activeRef = useRef<LivePointModule | null>(null);
  dirtyRef.current = dirty;
  activeRef.current = active;

  useEffect(() => setMounted(true), []);

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
    if (current && dirtyRef.current && !window.confirm("Имате незапазен текст. Да сменя панела?")) return;
    if (current === null) opener.current = document.activeElement as HTMLElement | null;
    activeRef.current = module;
    setActive(module);
    setDirty(false);
    writeQuery(module, current === null ? "push" : "replace");
  }, [close]);

  useScrollLock(active !== null);
  useHeaderCompact(active !== null);

  useEffect(() => {
    if (!active) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== "Tab" || !panel.current) return;
      const items = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((item) => item.offsetParent !== null);
      const first = items[0];
      const last = items.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [active, close]);

  useEffect(() => {
    if (!active || !panel.current) return;
    panel.current.querySelector<HTMLElement>("[data-lp-panel-body]")?.scrollTo({ top: 0 });
    const target =
      panel.current.querySelector<HTMLElement>("[data-autofocus]") ?? panel.current.querySelector<HTMLElement>(FOCUSABLE);
    target?.focus({ preventScroll: true });
  }, [active]);

  const value = useMemo<LivePointContextValue>(
    () => ({ weather, trafficConnected, camerasLiveLabel, latest, active, open, close }),
    [weather, trafficConnected, camerasLiveLabel, latest, active, open, close],
  );

  return (
    <LivePointContext.Provider value={value}>
      {children}
      {active && mounted
        ? createPortal(
            <div className="np-lp-layer fixed inset-x-0 top-[var(--np-header-h)] bottom-0 z-50 overflow-x-hidden overflow-y-auto overscroll-contain px-2.5 pt-3 pb-6 sm:px-5 lg:pl-[calc(var(--np-rail-w)+1.5rem)] lg:pr-6">
              <button
                type="button"
                aria-label="Затвори LivePoint"
                tabIndex={-1}
                className="np-lp-scrim fixed inset-x-0 top-[var(--np-header-h)] bottom-0 cursor-default lg:left-[var(--np-rail-w)]"
                onClick={close}
              />
              <div
                ref={panel}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                className={`np-lp-panel np-card relative mx-auto mb-auto flex w-full min-w-0 flex-col overflow-hidden ${active === "traffic" ? "np-lp-traffic" : active === "report" || active === "my-news" ? "np-lp-submission-panel max-h-[calc(100dvh-var(--np-header-h)-1.5rem)]" : "max-h-[calc(100dvh-var(--np-header-h)-1.5rem)] lg:max-h-[min(78dvh,44rem)]"} ${PANEL_WIDTH[active]}`}
              >
                <div className={`flex shrink-0 items-center gap-3 border-b border-line px-4 py-3 sm:px-5 ${active === "traffic" ? "sm:py-3" : "sm:py-4"}`}>
                  <h2
                    id={titleId}
                    data-autofocus
                    tabIndex={-1}
                    className="flex min-w-0 flex-1 items-center gap-2.5 text-lg font-extrabold tracking-tight text-ink outline-none"
                  >
                    <span className="np-ring" aria-hidden="true" />
                    {MODULE_LABELS[active]}
                  </h2>
                  <span className="hidden text-xs font-semibold text-muted sm:inline">{PANEL_SUBTITLES[active]}</span>
                  {active === "traffic" && <Link href={MODULE_PATHS.traffic} aria-label="Подробности за трафика" className="inline-flex shrink-0 rounded-full border border-accent/30 bg-surface-2 px-3 py-2 text-xs font-extrabold text-link transition-colors hover:border-accent hover:bg-accent hover:text-on-accent sm:px-4"><span className="sm:hidden">Още ↗</span><span className="hidden sm:inline">Подробности за трафика ↗</span></Link>}
                  <button
                    type="button"
                    aria-label="Затвори"
                    onClick={close}
                    className="inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-line bg-surface-2 text-muted transition-colors hover:text-ink"
                  >
                    <CloseIcon width={18} height={18} />
                  </button>
                </div>
                <div data-lp-panel-body className={`${active === "traffic" ? "min-h-0 flex-1 overflow-hidden px-2.5 py-2.5 sm:px-4 sm:py-3" : "np-scroll-soft min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5 sm:py-5"}`}>
                  {active === "weather" ? <WeatherPanel initial={weather} /> : null}
                  {active === "traffic" ? <TrafficPanel connected={trafficConnected} /> : null}
                  {active === "cameras" ? <CamerasPanel variant="panel" /> : null}
                  {active === "report" ? <ReportPanel onDirtyChange={setDirty} /> : null}
                  {active === "my-news" ? <MyNewsPanel onDirtyChange={setDirty} /> : null}
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
            </div>,
            document.body,
          )
        : null}
    </LivePointContext.Provider>
  );
}
