import Link from "next/link";
import type { LatestHeadline, WeatherForecast } from "@/lib/livepoint/types";
import type { DataEnvelope } from "@/lib/livepoint/types";
import { MODULE_PATHS } from "@/lib/livepoint/config";
import { formatTempC } from "@/lib/livepoint/weather/labels";
import { CameraIcon, CarIcon, ChevronRightIcon, CloudSunIcon, FeatherIcon, HeadphonesIcon, MegaphoneIcon } from "../icons";

type Props = {
  weather: DataEnvelope<WeatherForecast>;
  latest: LatestHeadline | null;
};

/** Same chrome as LivePointStrip, but plain links until the interactive strip loads. */
export function LivePointStripFallback({ weather, latest }: Props) {
  const forecast = weather.status === "ok" || weather.status === "stale" ? weather.payload : null;
  const items = [
    { href: MODULE_PATHS.podcast, label: "Podcast", icon: <HeadphonesIcon width={17} height={17} /> },
    { href: MODULE_PATHS.weather, label: `Време${forecast ? ` ${formatTempC(forecast.current.temperatureC)}` : ""}`, icon: <CloudSunIcon width={17} height={17} /> },
    { href: MODULE_PATHS.traffic, label: "Трафик", icon: <CarIcon width={17} height={17} /> },
    { href: MODULE_PATHS.cameras, label: "Камери", icon: <CameraIcon width={17} height={17} /> },
    { href: MODULE_PATHS.report, label: "Подай сигнал", icon: <MegaphoneIcon width={17} height={17} /> },
    { href: MODULE_PATHS["my-news"], label: "Моята новина", icon: <FeatherIcon width={17} height={17} /> },
  ] as const;

  return (
    <div className="np-lp-row flex items-center lg:pl-[var(--np-rail-w)]" data-np-livepoint-defer>
      <div data-rubrics-motion className="np-lp-strip flex h-11 w-full min-w-0 items-center overflow-x-auto px-2 lg:h-full lg:gap-0 lg:px-0 lg:pl-2 lg:pr-3 xl:gap-1 xl:pl-3 xl:pr-8 3xl:pl-4 3xl:pr-12">
        <div className="np-lp-brand flex shrink-0 items-center lg:h-full">
          <span className="hidden h-4 w-px shrink-0 bg-line lg:block" aria-hidden="true" />
          <div className="np-lp-brand-mark flex min-h-11 shrink-0 flex-col items-center justify-center gap-0.5 px-2.5 py-1 text-center text-[0.625rem] leading-tight font-bold whitespace-nowrap text-body sm:text-xs lg:h-full lg:min-w-0 lg:flex-row lg:items-center lg:gap-1.5 lg:px-2.5 lg:py-0 lg:text-[0.8125rem] lg:font-semibold xl:px-4" aria-label="LivePoint">
            <span className="np-lp-brand-mobile flex flex-col items-center gap-0.5 lg:hidden">
              <span className="np-lp-item-icon np-lp-brand-icon-slot inline-flex items-center justify-center overflow-visible" aria-hidden="true">
                <span className="np-lp-brand-pulse inline-flex items-center gap-0.5">
                  <span className="np-lp-heart np-lp-brand-icon"><span className="np-ring !size-3" /></span>
                  <ChevronRightIcon className="np-lp-brand-cue shrink-0" width={11} height={11} />
                </span>
              </span>
              <span className="np-lp-item-label np-lp-word tracking-tight text-ink">LivePoint</span>
            </span>
            <span className="np-lp-brand-desktop hidden lg:inline-flex lg:items-center lg:gap-1.5">
              <span className="np-lp-heart np-lp-brand-icon" aria-hidden="true"><span className="np-ring !size-[1.125rem]" /></span>
              <span className="np-lp-word tracking-tight text-ink">LivePoint</span>
            </span>
          </div>
          <span className="hidden h-4 w-px shrink-0 bg-line sm:block" aria-hidden="true" />
        </div>
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            prefetch={false}
            className="np-lp-item group flex min-h-11 shrink-0 flex-col items-center justify-center gap-0.5 rounded-lg px-2.5 py-1 text-center text-[0.625rem] leading-tight font-bold whitespace-nowrap text-body sm:text-xs lg:h-full lg:min-w-0 lg:flex-row lg:gap-1 lg:px-1.5 lg:py-0 lg:text-[0.8125rem] lg:font-semibold xl:gap-1.5 xl:px-2"
          >
            <span className="np-lp-item-icon lg:max-xl:hidden" aria-hidden="true">{item.icon}</span>
            <span className="np-lp-item-label np-lp-word">{item.label}</span>
          </Link>
        ))}
        {latest ? (
          <Link
            href={latest.path}
            prefetch={false}
            className="np-lp-latest ml-auto hidden min-w-0 max-w-[min(100%,18rem)] shrink truncate px-2 text-sm font-semibold text-ink lg:inline-flex"
          >
            {latest.title}
          </Link>
        ) : null}
      </div>
    </div>
  );
}
