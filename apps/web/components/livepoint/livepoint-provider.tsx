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
  weather: "max-w-2xl",
  traffic: "max-w-3xl",
  cameras: "max-w-2xl",
  report: "max-w-lg",
  "my-news": "max-w-lg",
};

function writeQuery(module: LivePointModule | null) {
  const url = new URL(window.location.href);
  if (module) url.searchParams.set("livepoint", module);
  else url.searchParams.delete("livepoint");
  const next = `${url.pathname}${url.search}${url.hash}`;
  if (`${window.location.pathname}${window.location.search}${window.location.hash}` !== next) {
    window.history.replaceState(window.history.state, "", next);
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
  dirtyRef.current = dirty;

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    setActive(queryModule());
    setDirty(false);
  }, [pathname]);

  useEffect(() => {
    const onPop = () => setActive(queryModule());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const close = useCallback(() => {
    if (dirtyRef.current && !window.confirm("Имате незапазен текст. Да затворя панела?")) return;
    setActive(null);
    setDirty(false);
    writeQuery(null);
    const back = opener.current;
    opener.current = null;
    if (back?.isConnected) queueMicrotask(() => back.focus({ preventScroll: true }));
  }, []);

  const open = useCallback(
    (module: LivePointModule) => {
      setActive((current) => {
        if (current === module) {
          if (dirtyRef.current && !window.confirm("Имате незапазен текст. Да затворя панела?")) return current;
          setDirty(false);
          writeQuery(null);
          const back = opener.current;
          opener.current = null;
          if (back?.isConnected) queueMicrotask(() => back.focus({ preventScroll: true }));
          return null;
        }
        if (current && dirtyRef.current && !window.confirm("Имате незапазен текст. Да сменя панела?")) return current;
        setDirty(false);
        if (current === null) opener.current = document.activeElement as HTMLElement | null;
        writeQuery(module);
        return module;
      });
    },
    [],
  );

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
            <div className="np-lp-layer fixed inset-x-0 top-[var(--np-header-h)] bottom-0 z-50 overflow-x-hidden overflow-y-auto overscroll-contain px-3 pt-3 pb-20 sm:px-5 lg:pl-[calc(var(--np-rail-w)+1.5rem)] lg:pr-6">
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
                className={`np-lp-panel np-card relative mx-auto mb-auto flex max-h-[min(88dvh,44rem)] w-full min-w-0 flex-col overflow-hidden ${PANEL_WIDTH[active]}`}
              >
                <div className="flex shrink-0 items-center gap-3 px-4 pt-3.5 pb-2.5 sm:px-5">
                  <h2
                    id={titleId}
                    data-autofocus
                    tabIndex={-1}
                    className="flex min-w-0 flex-1 items-center gap-2.5 text-lg font-extrabold tracking-tight text-ink outline-none"
                  >
                    <span className="np-ring" aria-hidden="true" />
                    {MODULE_LABELS[active]}
                  </h2>
                  <Link
                    href={MODULE_PATHS[active]}
                    className="hidden rounded-full px-2.5 py-1 text-sm font-semibold text-link hover:bg-surface-2 sm:inline-flex"
                  >
                    Страница
                  </Link>
                  <button
                    type="button"
                    aria-label="Затвори"
                    onClick={close}
                    className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-2 hover:text-ink"
                  >
                    <CloseIcon width={18} height={18} />
                  </button>
                </div>
                <div className="np-scroll-soft min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4 sm:px-5 sm:pb-5">
                  {active === "weather" ? <WeatherPanel initial={weather} /> : null}
                  {active === "traffic" ? <TrafficPanel connected={trafficConnected} /> : null}
                  {active === "cameras" ? <CamerasPanel /> : null}
                  {active === "report" ? <ReportPanel onDirtyChange={setDirty} /> : null}
                  {active === "my-news" ? <MyNewsPanel onDirtyChange={setDirty} /> : null}
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </LivePointContext.Provider>
  );
}
