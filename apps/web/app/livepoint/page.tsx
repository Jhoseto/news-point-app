import Link from "next/link";
import type { Metadata } from "next";
import { MODULE_LABELS, MODULE_PATHS, type LivePointModule } from "@/lib/livepoint/config";

export const metadata: Metadata = {
  title: "LivePoint · Пловдив",
  description: "Локален слой за време, трафик, камери и сигнали от граждани.",
};

const NOTES: Record<LivePointModule, string> = {
  weather: "Прогноза за Пловдив",
  traffic: "Карта, когато има потвърден източник",
  cameras: "Каталог с линк към оригинала",
  report: "Сигнал към редакцията",
  "my-news": "Авторски материал за преглед",
};

const MODULES = Object.keys(MODULE_PATHS) as LivePointModule[];

export default function LivePointHomePage() {
  return (
    <div className="np-container max-w-3xl py-8">
      <p className="text-xs font-extrabold tracking-[0.16em] text-muted uppercase">LivePoint</p>
      <h1 className="mt-2 flex items-center gap-2.5 text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">
        <span className="np-ring" aria-hidden="true" />
        Пловдив
      </h1>
      <p className="mt-3 max-w-xl text-base text-body">
        Локален слой за времето, пътя, камерите и сигналите към редакцията. Без измислени температури, индекси или LIVE
        етикети.
      </p>
      <ul className="mt-8 divide-y divide-line border-y border-line">
        {MODULES.map((module) => (
          <li key={module}>
            <Link href={MODULE_PATHS[module]} className="flex items-baseline justify-between gap-4 py-4 hover:text-logo">
              <span className="text-base font-extrabold text-ink">{MODULE_LABELS[module]}</span>
              <span className="text-sm font-medium text-muted">{NOTES[module]}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
