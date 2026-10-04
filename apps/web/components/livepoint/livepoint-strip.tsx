"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { LivePointModule } from "@/lib/livepoint/config";
import { formatTempC } from "@/lib/livepoint/weather/labels";
import { CameraIcon, CarIcon, ChevronLeftIcon, ChevronRightIcon, CloudSunIcon, FeatherIcon, HeadphonesIcon, MegaphoneIcon } from "../icons";
import { useLivePoint } from "./livepoint-provider";
import { LatestHeadlineCapsule } from "./latest-headline-capsule";

function StripItem({
  module,
  icon,
  children,
  className,
}: {
  module: LivePointModule;
  icon: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const { active, open } = useLivePoint();
  const on = active === module;
  return (
    <button
      type="button"
      onClick={() => open(module)}
      data-lp-module={module}
      aria-haspopup="dialog"
      aria-expanded={on}
      data-active={on || undefined}
      className={`np-lp-item group flex min-h-11 shrink-0 flex-col items-center justify-center gap-0.5 rounded-lg px-2.5 py-1 text-center text-[0.625rem] leading-tight font-bold whitespace-nowrap text-body sm:text-xs lg:h-full lg:min-w-0 lg:flex-row lg:gap-1.5 lg:px-2 lg:py-0 lg:text-[0.8125rem] lg:font-semibold ${className ?? ""}`}
    >
      <span className="np-lp-item-icon" aria-hidden="true">{icon}</span>
      <span className="np-lp-item-label">{children}</span>
    </button>
  );
}

/**
 * Second header row: editorial utility links, same type as the rest of the chrome.
 * Active item is marked with the same hairline the search field uses.
 */
function StripScroller({ children }: { children: ReactNode }) {
  const scroller = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  const measure = useCallback(() => {
    const element = scroller.current;
    const mobile = window.matchMedia("(max-width: 63.999rem)").matches;
    if (!element || !mobile) {
      setEdges({ left: false, right: false });
      return;
    }
    const max = element.scrollWidth - element.clientWidth;
    const left = element.scrollLeft > 4;
    const right = max - element.scrollLeft > 4;
    setEdges(previous => previous.left === left && previous.right === right ? previous : { left, right });
  }, []);

  useEffect(() => {
    const element = scroller.current;
    if (!element) return;
    measure();
    element.addEventListener("scroll", measure, { passive: true });
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    const media = window.matchMedia("(max-width: 63.999rem)");
    media.addEventListener("change", measure);
    return () => {
      element.removeEventListener("scroll", measure);
      observer.disconnect();
      media.removeEventListener("change", measure);
    };
  }, [measure]);

  function nudge(direction: -1 | 1) {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    scroller.current?.scrollBy({ left: direction * 128, behavior: reduced ? "auto" : "smooth" });
  }

  return (
    <div className="np-lp-scroll-wrap relative min-w-0 flex-1 lg:contents" data-more-left={edges.left || undefined} data-more-right={edges.right || undefined}>
      <div ref={scroller} className="np-lp-scroll flex h-full gap-0.5 overflow-x-auto lg:contents lg:overflow-visible">
        {children}
      </div>
      {edges.left ? (
        <button type="button" className="np-lp-scroll-hint is-left lg:hidden" aria-label="Още наляво" onClick={() => nudge(-1)}>
          <ChevronLeftIcon width={13} height={13} />
        </button>
      ) : null}
      {edges.right ? (
        <button type="button" className="np-lp-scroll-hint is-right lg:hidden" aria-label="Още надясно" onClick={() => nudge(1)}>
          <ChevronRightIcon width={13} height={13} />
        </button>
      ) : null}
    </div>
  );
}

export function LivePointStrip() {
  const { weather, latest } = useLivePoint();
  const forecast = weather.status === "ok" || weather.status === "stale" ? weather.payload : null;

  return (
    <div className="np-lp-row flex items-center lg:pl-[var(--np-rail-w)]">
      <div className="np-lp-strip flex h-11 w-full min-w-0 items-center px-2 lg:h-full lg:gap-1 lg:px-0 lg:pl-3 lg:pr-8 3xl:pl-4 3xl:pr-12">
        <StripScroller>
          <div className="np-lp-brand flex shrink-0 items-center lg:h-full">
            <span className="hidden h-4 w-px shrink-0 bg-line lg:block" aria-hidden="true" />
            <div
              className="np-lp-brand-mark flex min-h-11 shrink-0 flex-col items-center justify-center gap-0.5 px-2.5 py-1 text-center text-[0.625rem] leading-tight font-bold whitespace-nowrap text-body sm:text-xs lg:h-full lg:min-w-0 lg:flex-row lg:items-center lg:gap-1.5 lg:px-4 lg:py-0 lg:text-[0.8125rem] lg:font-semibold"
              aria-label="LivePoint"
            >
              <span className="np-lp-brand-mobile flex flex-col items-center gap-0.5 lg:hidden">
                <span className="np-lp-item-icon np-lp-brand-icon-slot inline-flex items-center justify-center overflow-visible" aria-hidden="true">
                  <span className="np-lp-brand-pulse inline-flex items-center gap-0.5">
                    <span className="np-lp-heart np-lp-brand-icon">
                      <span className="np-ring !size-3" />
                    </span>
                    <ChevronRightIcon className="np-lp-brand-cue shrink-0" width={11} height={11} />
                  </span>
                </span>
                <span className="np-lp-item-label np-lp-word tracking-tight text-ink">LivePoint</span>
              </span>
              <span className="np-lp-brand-desktop hidden lg:inline-flex lg:items-center lg:gap-1.5">
                <span className="np-lp-heart np-lp-brand-icon" aria-hidden="true">
                  <span className="np-ring !size-[1.125rem]" />
                </span>
                <span className="np-lp-word tracking-tight text-ink">LivePoint</span>
              </span>
            </div>
            <span className="hidden h-4 w-px shrink-0 bg-line sm:block" aria-hidden="true" />
          </div>

          <StripItem module="podcast" icon={<HeadphonesIcon width={17} height={17} />}>
            NewsPodcast
          </StripItem>
          <StripItem module="weather" icon={<CloudSunIcon width={17} height={17} />}>
            Време{forecast ? ` ${formatTempC(forecast.current.temperatureC)}` : ""}
          </StripItem>
          <StripItem module="traffic" icon={<CarIcon width={17} height={17} />}>
            Трафик
          </StripItem>
          <StripItem module="cameras" icon={<CameraIcon width={17} height={17} />}>
            Камери
          </StripItem>
          <StripItem module="report" icon={<MegaphoneIcon width={17} height={17} />}>
            Подай сигнал
          </StripItem>
          <StripItem module="my-news" icon={<FeatherIcon width={17} height={17} />}>
            Моята новина
          </StripItem>
        </StripScroller>

        {latest ? <LatestHeadlineCapsule latest={latest} /> : null}
      </div>
    </div>
  );
}
