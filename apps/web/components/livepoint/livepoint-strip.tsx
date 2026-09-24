"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import type { LivePointModule } from "@/lib/livepoint/config";
import { formatTempC } from "@/lib/livepoint/weather/labels";
import { formatShort } from "@/lib/format";
import { CameraIcon, CarIcon, CloudSunIcon, FeatherIcon, MegaphoneIcon } from "../icons";
import { useLivePoint } from "./livepoint-provider";

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
      aria-haspopup="dialog"
      aria-expanded={on}
      data-active={on || undefined}
      className="np-lp-item group inline-flex h-full shrink-0 items-center gap-1.5 px-2 text-[0.8125rem] font-semibold whitespace-nowrap text-body transition-colors hover:text-logo data-[active]:text-ink"
    >
      <span className="text-muted transition-colors group-hover:text-logo group-data-[active]:text-logo">{icon}</span>
      {children}
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
    <div className="np-lp-row flex h-10 items-center border-t border-line lg:h-12 lg:pl-[var(--np-rail-w)]">
      <div className="np-lp-strip flex h-full w-full items-center gap-0.5 overflow-x-auto px-2 sm:px-4 lg:px-8 3xl:px-12">
        <Link
          href="/livepoint/"
          className="mr-1 inline-flex shrink-0 items-center gap-2 py-1 pr-2 text-[0.8125rem] font-extrabold tracking-tight text-ink"
        >
          <span className="np-ring !size-3.5" aria-hidden="true" />
          LivePoint
          <span className="hidden font-semibold text-muted sm:inline">Пловдив</span>
        </Link>

        <span className="hidden h-4 w-px shrink-0 bg-line sm:block" aria-hidden="true" />

        <StripItem module="weather" icon={<CloudSunIcon width={15} height={15} />}>
          {forecast ? formatTempC(forecast.current.temperatureC) : "Време"}
        </StripItem>
        <StripItem module="traffic" icon={<CarIcon width={15} height={15} />}>
          Трафик
        </StripItem>
        <StripItem module="cameras" icon={<CameraIcon width={15} height={15} />}>
          Камери
        </StripItem>
        <StripItem module="report" icon={<MegaphoneIcon width={15} height={15} />}>
          Подай сигнал
        </StripItem>
        <StripItem module="my-news" icon={<FeatherIcon width={15} height={15} />}>
          Моята новина
        </StripItem>

        {latest ? (
          <Link
            href={latest.path}
            className="np-lp-latest group ml-auto hidden min-w-0 items-center gap-2.5 pl-4 lg:flex"
          >
            <span className="shrink-0 text-[0.625rem] font-extrabold tracking-[0.14em] text-faint uppercase">Последно</span>
            <span className="truncate text-[0.8125rem] font-semibold text-body transition-colors group-hover:text-logo">
              {latest.title}
            </span>
            <time className="shrink-0 text-xs font-semibold text-muted tabular-nums" dateTime={latest.publishedAt}>
              {formatShort(new Date(latest.publishedAt))}
            </time>
          </Link>
        ) : null}
      </div>
    </div>
  );
}
