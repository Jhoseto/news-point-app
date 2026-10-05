"use client";

import { useEffect, useMemo, useState } from "react";
import { CAMERA_CATALOG, canPlayInApp } from "@/lib/livepoint/cameras/catalog";
import type { CameraCategory, CameraEntry } from "@/lib/livepoint/types";
import { CameraLiveEmbed } from "./camera-live-embed";

const CATEGORIES: { id: CameraCategory | "all"; label: string }[] = [
  { id: "all", label: "Всички" },
  { id: "traffic", label: "Трафик" },
  { id: "city", label: "Град" },
  { id: "region", label: "Регион" },
];

function pickDefaultCamera(cameras: readonly CameraEntry[]): string | null {
  const live = cameras.filter((c) => canPlayInApp(c));
  const rtsp = live.find((c) => c.embedUrl?.includes("rtsp.me"));
  return rtsp?.slug ?? live[0]?.slug ?? cameras[0]?.slug ?? null;
}

function categoryCounts() {
  const result: Record<CameraCategory | "all", number> = { all: CAMERA_CATALOG.length, traffic: 0, city: 0, region: 0 };
  for (const camera of CAMERA_CATALOG) result[camera.category] += 1;
  return result;
}

const COUNTS = categoryCounts();

function CameraListRow({ camera, selected, onSelect }: { camera: CameraEntry; selected: boolean; onSelect: () => void }) {
  const live = canPlayInApp(camera);
  return (
    <li>
      <button
        type="button"
        aria-pressed={selected}
        onClick={onSelect}
        className={`group flex w-full items-start gap-2 border-b border-line px-3 py-2.5 text-left transition-colors last:border-b-0 hover:bg-surface-2 sm:px-3.5 ${
          selected ? "border-l-[3px] border-l-accent bg-accent/5 pl-[calc(0.75rem-3px)] sm:pl-[calc(0.875rem-3px)]" : "border-l-[3px] border-l-transparent"
        }`}
      >
        <span
          className={`mt-1.5 size-2 shrink-0 rounded-full ${live ? "bg-rose-600 shadow-[0_0_0_3px_rgb(225_29_72_/_0.15)]" : "bg-muted"}`}
          aria-hidden="true"
        />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-extrabold text-ink group-hover:text-logo">{camera.name}</span>
          <span className="mt-0.5 block text-xs leading-snug text-muted">
            {camera.place}
            {camera.direction ? ` · ${camera.direction}` : ""}
          </span>
        </span>
        {live ? (
          <span className="shrink-0 rounded-full bg-rose-600/10 px-2 py-0.5 text-[10px] font-extrabold tracking-wide text-rose-700 uppercase dark:text-rose-400">
            На живо
          </span>
        ) : null}
      </button>
    </li>
  );
}

function CameraPlayerBlock({ camera, compact }: { camera: CameraEntry; compact?: boolean }) {
  const live = canPlayInApp(camera);
  return (
    <div className={compact ? "space-y-2" : "space-y-0"}>
      {!compact ? (
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-3 py-2.5 sm:px-4">
          <div className="min-w-0">
            <h3 className="truncate text-base font-extrabold tracking-tight text-ink sm:text-lg">{camera.name}</h3>
            <p className="mt-0.5 truncate text-xs text-muted sm:text-sm">
              {camera.place}
              {camera.direction ? ` · ${camera.direction}` : ""}
            </p>
          </div>
          {live ? (
            <span className="shrink-0 rounded-full bg-rose-600/10 px-2.5 py-0.5 text-[10px] font-extrabold tracking-wide text-rose-700 uppercase dark:text-rose-400">
              На живо
            </span>
          ) : null}
        </div>
      ) : (
        <div>
          <h3 className="text-sm font-extrabold text-ink">{camera.name}</h3>
          <p className="mt-0.5 text-xs text-muted">{camera.place}</p>
        </div>
      )}
      <div className={compact ? "" : "p-2.5 sm:p-3"}>
        {live && camera.embedUrl ? (
          <CameraLiveEmbed title={camera.name} embedUrl={camera.embedUrl} sourceUrl={camera.sourceUrl} eager />
        ) : (
          <div className="flex aspect-video flex-col items-center justify-center gap-2 rounded-2xl border border-line bg-surface-2 px-4 text-center text-sm text-body">
            <p>Няма вграден поток в приложението.</p>
            <a href={camera.sourceUrl} target="_blank" rel="noreferrer" className="font-semibold text-link">
              Отвори при източника ↗
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

export function CamerasPanel({ variant = "page" }: { variant?: "panel" | "page" }) {
  const [category, setCategory] = useState<CameraCategory | "all">("all");
  const [selected, setSelected] = useState<string | null>(null);

  const cameras = useMemo(
    () => (category === "all" ? CAMERA_CATALOG : CAMERA_CATALOG.filter((c) => c.category === category)),
    [category],
  );

  useEffect(() => {
    setSelected((current) => (current && cameras.some((c) => c.slug === current) ? current : pickDefaultCamera(cameras)));
  }, [cameras]);

  const active = cameras.find((c) => c.slug === selected) ?? cameras.find((c) => canPlayInApp(c)) ?? cameras[0];
  const liveInView = cameras.filter((c) => canPlayInApp(c)).length;

  if (variant === "panel") {
    return (
      <div className="flex min-h-0 flex-col gap-3">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Категория камери">
          {CATEGORIES.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              aria-pressed={category === id}
              onClick={() => setCategory(id)}
              className="min-h-11 min-w-11 rounded-full border border-line bg-surface-2 px-2.5 py-1 text-[11px] font-extrabold text-body aria-pressed:border-accent aria-pressed:bg-accent aria-pressed:text-on-accent"
            >
              {label}
            </button>
          ))}
        </div>
        {active ? <CameraPlayerBlock camera={active} compact /> : null}
        <ul className="np-scroll-soft max-h-40 overflow-y-auto rounded-xl border border-line bg-surface shadow-card">
          {cameras.map((camera) => (
            <CameraListRow
              key={camera.slug}
              camera={camera}
              selected={camera.slug === active?.slug}
              onSelect={() => setSelected(camera.slug)}
            />
          ))}
        </ul>
      </div>
    );
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card" aria-label="Публични камери в Пловдив и региона">
      <div className="flex flex-col gap-2 border-b border-line px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:px-4">
        <p className="text-[11px] font-extrabold tracking-[0.12em] text-logo uppercase">
          {CAMERA_CATALOG.length} камери · {liveInView} на живо
        </p>
        <div className="flex flex-wrap gap-1" role="group" aria-label="Филтър по категория">
          {CATEGORIES.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              aria-pressed={category === id}
              onClick={() => setCategory(id)}
              className="min-h-11 min-w-11 shrink-0 rounded-full border border-line bg-surface-2 px-2.5 py-1 text-[11px] font-extrabold text-body transition-colors hover:border-line hover:text-ink aria-pressed:border-accent aria-pressed:bg-accent aria-pressed:text-on-accent sm:px-3 sm:text-xs"
            >
              {label} <span className="ml-0.5 opacity-70">{COUNTS[id]}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="grid xl:grid-cols-[minmax(0,1.7fr)_minmax(16rem,0.65fr)]">
        <div className="min-w-0 border-b border-line xl:border-b-0 xl:border-r">
          {active ? <CameraPlayerBlock camera={active} /> : null}
        </div>

        <aside className="flex min-w-0 flex-col" aria-label="Списък с камери">
          <div className="border-b border-line px-3 py-2 sm:px-4">
            <h3 className="text-xs font-extrabold text-ink sm:text-sm">
              Каталог <span className="font-bold text-muted">· {cameras.length}</span>
            </h3>
          </div>
          <ul className="np-scroll-soft max-h-[22rem] overflow-y-auto xl:max-h-[min(36rem,calc(var(--np-desktop-height,100vh)-14rem))]">
            {cameras.map((camera) => (
              <CameraListRow
                key={camera.slug}
                camera={camera}
                selected={camera.slug === active?.slug}
                onSelect={() => setSelected(camera.slug)}
              />
            ))}
          </ul>
        </aside>
      </div>
    </section>
  );
}
