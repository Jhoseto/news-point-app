"use client";

import type { ReactNode } from "react";
import type { LivePointModule } from "@/lib/livepoint/config";
import { formatTempC } from "@/lib/livepoint/weather/labels";
import { CameraIcon, CarIcon, CloudSunIcon, FeatherIcon, HeadphonesIcon, MegaphoneIcon } from "../icons";
import { useLivePoint } from "./livepoint-provider";
import { LatestHeadlineCapsule } from "./latest-headline-capsule";

function StripItem({
  module,
  icon,
  children,
}: {
  module: LivePointModule;
  icon: ReactNode;
  children: ReactNode;
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
      className="np-lp-item group flex min-h-11 min-w-0 flex-col items-center justify-center gap-0.5 rounded-lg px-0.5 py-1 text-center text-[0.625rem] leading-tight font-bold text-body sm:text-xs lg:h-full lg:flex-row lg:gap-1.5 lg:px-2 lg:py-0 lg:text-[0.8125rem] lg:font-semibold lg:whitespace-nowrap"
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
export function LivePointStrip() {
  const { weather, latest } = useLivePoint();
  const forecast = weather.status === "ok" || weather.status === "stale" ? weather.payload : null;

  return (
    <div className="np-lp-row flex items-center lg:pl-[var(--np-rail-w)]">
      <div className="np-lp-strip flex h-full w-full min-w-0 flex-col px-4 lg:flex-row lg:items-center lg:gap-1 lg:pl-3 lg:pr-8 3xl:pl-4 3xl:pr-12">
        <div className="np-lp-brand flex shrink-0 items-center lg:h-full">
          <span className="hidden h-4 w-px shrink-0 bg-line lg:block" aria-hidden="true" />
          <span className="inline-flex h-7 items-center gap-2 px-3 text-[0.75rem] font-extrabold tracking-tight text-ink lg:h-full lg:px-4 lg:py-0 lg:text-[0.8125rem]">
            <span className="np-lp-heart" aria-hidden="true">
              <span className="np-ring !size-4" />
            </span>
            <span className="np-lp-word">LivePoint</span>
          </span>
          <span className="hidden h-4 w-px shrink-0 bg-line sm:block" aria-hidden="true" />
        </div>

        <div className="grid w-full grid-cols-3 gap-0.5 py-1 lg:flex lg:h-full lg:w-auto lg:shrink-0 lg:py-0">
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
        </div>

        {latest ? <LatestHeadlineCapsule latest={latest} /> : null}
      </div>
    </div>
  );
}
