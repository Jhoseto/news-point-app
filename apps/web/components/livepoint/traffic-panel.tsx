"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import type { DataEnvelope, TrafficIncident, TrafficIncidentsPayload } from "@/lib/livepoint/types";
import { trafficFilterForCategory, type TrafficFilter } from "@/lib/livepoint/traffic/labels";
import { formatFull } from "@/lib/format";
import { TrafficMap } from "./traffic-map";

const FILTERS: { id: TrafficFilter; label: string }[] = [
  { id: "all", label: "Всички" },
  { id: "congestion", label: "Задръствания" },
  { id: "restrictions", label: "Ограничения" },
  { id: "roadworks", label: "Ремонти" },
  { id: "other", label: "Други" },
];

type SortOrder = "newest" | "delay" | "category";
type MapStyle = "auto" | "day" | "night";
const MODAL_PAGE_SIZE = 3;
const TrafficMap3D = dynamic(() => import("./traffic-map-3d").then((module) => module.TrafficMap3D), { ssr: false });

const TRAFFIC_SELECT =
  "np-traffic-select min-h-9 w-full rounded-full border border-line bg-surface-2 px-3.5 py-1.5 text-xs font-extrabold text-body";

function layerToggle(compact: boolean) {
  return `rounded-full border border-line bg-surface-2 font-bold text-body transition-colors hover:text-ink aria-pressed:border-accent/40 aria-pressed:bg-accent/10 aria-pressed:text-ink ${
    compact ? "min-h-9 px-2.5 py-1 text-[11px]" : "min-h-11 px-3 py-1.5 text-xs"
  }`;
}

function filterChip(compact: boolean) {
  return `shrink-0 rounded-full border border-line bg-surface-2 font-extrabold text-body transition-colors hover:border-accent/40 hover:text-ink aria-pressed:border-accent aria-pressed:bg-accent aria-pressed:text-on-accent ${
    compact ? "min-h-9 px-2.5 py-1 text-[11px]" : "min-h-11 px-3 py-1.5 text-xs sm:text-sm"
  }`;
}

function eventTime(value: string | null): number {
  const parsed = value ? Date.parse(value) : NaN;
  return Number.isFinite(parsed) ? parsed : -Infinity;
}

function formatDelay(seconds: number | null): string | null {
  if (seconds === null || seconds <= 0) return null;
  const minutes = Math.ceil(seconds / 60);
  return `Отчетено забавяне: ${minutes} ${minutes === 1 ? "минута" : "минути"}`;
}

function eventCount(count: number): string {
  return `${count} ${count === 1 ? "събитие" : "събития"}`;
}

export function TrafficPanel({ connected, variant = "modal", cesiumToken }: { connected: boolean; variant?: "modal" | "page"; cesiumToken?: string | undefined }) {
  const [incidents, setIncidents] = useState<DataEnvelope<TrafficIncidentsPayload> | null>(null);
  const [filter, setFilter] = useState<TrafficFilter>("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortOrder>("newest");
  const [showFlow, setShowFlow] = useState(true);
  const [showMarkers, setShowMarkers] = useState(true);
  const [showMotion, setShowMotion] = useState(true);
  const [mapStyle, setMapStyle] = useState<MapStyle>("auto");
  const [mapMode, setMapMode] = useState<"2d" | "3d">("2d");
  const [mobileView, setMobileView] = useState<"map" | "list">("map");
  const [listPage, setListPage] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [focusPosition, setFocusPosition] = useState<{ lat: number; lon: number } | null>(null);

  useEffect(() => {
    if (!connected) return;
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch("/api/livepoint/traffic/", { cache: "no-store" });
        if (!response.ok) throw new Error("traffic API unavailable");
        const data = (await response.json()) as DataEnvelope<TrafficIncidentsPayload>;
        if (!cancelled) setIncidents(data);
      } catch {
        if (!cancelled) setIncidents({
          source: "tomtom", fetchedAt: null, expiresAt: null, status: "unavailable",
          message: "Инцидентите не са достъпни в момента.", payload: null,
        });
      }
    })();
    return () => { cancelled = true; };
  }, [connected]);

  const all = useMemo(() => incidents?.payload?.incidents ?? [], [incidents]);
  const counts = useMemo(() => {
    const result: Record<TrafficFilter, number> = { all: all.length, congestion: 0, restrictions: 0, roadworks: 0, other: 0 };
    for (const item of all) result[trafficFilterForCategory(item.category)] += 1;
    return result;
  }, [all]);
  const shown = useMemo(() => {
    const search = query.trim().toLocaleLowerCase("bg-BG");
    return all
      .filter((item) => filter === "all" || trafficFilterForCategory(item.category) === filter)
      .filter((item) => !search || [item.description, item.categoryLabel, item.from, item.to]
        .some((value) => value?.toLocaleLowerCase("bg-BG").includes(search)))
      .sort((a, b) => {
        if (sort === "delay") return (b.delaySec ?? -1) - (a.delaySec ?? -1) || eventTime(b.startTime) - eventTime(a.startTime);
        if (sort === "category") return a.categoryLabel.localeCompare(b.categoryLabel, "bg") || eventTime(b.startTime) - eventTime(a.startTime);
        return eventTime(b.startTime) - eventTime(a.startTime);
      });
  }, [all, filter, query, sort]);
  const selected = all.find((item) => item.id === selectedId) ?? null;
  const pageCount = Math.max(1, Math.ceil(shown.length / MODAL_PAGE_SIZE));
  const safePage = Math.min(listPage, pageCount - 1);
  const visibleIncidents = variant === "page" ? shown : shown.slice(safePage * MODAL_PAGE_SIZE, (safePage + 1) * MODAL_PAGE_SIZE);

  function selectIncident(item: TrafficIncident) {
    setSelectedId(item.id);
    if (item.position) setFocusPosition({ ...item.position });
    if (variant === "modal") {
      setListPage(Math.floor(shown.findIndex((candidate) => candidate.id === item.id) / MODAL_PAGE_SIZE));
      setMobileView("list");
    }
  }

  function chooseFilter(next: TrafficFilter) {
    setFilter(next);
    setSelectedId(null);
    setFocusPosition(null);
    setListPage(0);
  }

  if (!connected) return (
    <div className="rounded-2xl border border-line bg-surface-2 px-6 py-10">
      <p className="text-lg font-extrabold text-ink">Картата още се свързва</p>
      <p className="mt-2 max-w-xl text-sm text-body">Ще я отворим, когато има потвърден източник за Пловдив. Дотогава не показваме непроверена пътна обстановка.</p>
    </div>
  );

  const compact = variant === "modal";

  return (
    <section className={compact ? "space-y-2" : "space-y-4"} aria-label="Пътна обстановка в Пловдив">
      <div className="np-traffic-toolbar rounded-2xl border border-line bg-surface shadow-card">
        <div className={`border-b border-line ${compact ? "space-y-2 px-2.5 py-2 sm:px-4" : "flex flex-wrap items-center justify-between gap-2 px-4 py-3 sm:px-5"}`}>
          <div className={compact ? "min-w-0" : undefined}>
            <p className={`font-extrabold tracking-[0.12em] text-logo uppercase ${compact ? "text-[10px] leading-tight" : "text-[11px] tracking-[0.15em]"}`}>Пловдив · пътна обстановка</p>
            <p className={`text-muted ${compact ? "truncate text-[10px] leading-tight" : "mt-1 text-xs"}`}>
              {incidents?.fetchedAt ? `Обновено ${formatFull(new Date(incidents.fetchedAt))}` : incidents ? incidents.message : "Зареждане на данните…"}
            </p>
          </div>
          <div className={`np-traffic-toolbar-toggles flex items-center gap-1 ${compact ? "w-full" : "flex-wrap gap-1.5"}`}>
            <button type="button" aria-pressed={showFlow} onClick={() => setShowFlow((value) => !value)} className={layerToggle(compact)}>Поток {showFlow ? "●" : "○"}</button>
            <button type="button" aria-pressed={showMarkers} onClick={() => setShowMarkers((value) => !value)} className={layerToggle(compact)}>Маркери {showMarkers ? "●" : "○"}</button>
            <button type="button" aria-pressed={showMotion} onClick={() => setShowMotion((value) => !value)} className={layerToggle(compact)} title={mapMode === "3d" ? "Движение по участъците от TomTom incidentDetails (не GPS на коли)" : undefined}>Движение {showMotion ? "●" : "○"}</button>
          </div>
        </div>
        {compact ? (
          <div className="flex items-center gap-1.5 border-b border-line px-2.5 py-1.5 sm:hidden">
            <label className="min-w-0 flex-1">
              <span className="sr-only">Филтрирай пътните събития</span>
              <select id="traffic-mobile-filter" value={filter} onChange={(event) => chooseFilter(event.target.value as TrafficFilter)} className={TRAFFIC_SELECT}>
                {FILTERS.map(({ id, label }) => <option key={id} value={id}>{label} · {incidents?.payload ? counts[id] : "—"}</option>)}
              </select>
            </label>
            <div className="grid shrink-0 grid-cols-2 gap-0.5 rounded-full border border-line bg-surface-2 p-0.5" role="group" aria-label="Изглед на трафика">
              <button type="button" aria-pressed={mobileView === "map"} onClick={() => setMobileView("map")} className="min-h-9 rounded-full px-2.5 py-1 text-[11px] font-extrabold text-muted aria-pressed:bg-surface aria-pressed:text-ink aria-pressed:shadow-card">Карта</button>
              <button type="button" aria-pressed={mobileView === "list"} onClick={() => setMobileView("list")} className="min-h-9 rounded-full px-2.5 py-1 text-[11px] font-extrabold text-muted aria-pressed:bg-surface aria-pressed:text-ink aria-pressed:shadow-card">Събития · {incidents?.payload ? shown.length : "—"}</button>
            </div>
          </div>
        ) : null}
        <div className={`${compact ? "hidden sm:flex" : "flex"} flex-wrap gap-1.5 ${compact ? "px-3 py-2 sm:px-4" : "px-3 py-3 sm:px-5"}`} role="group" aria-label="Покажи събития върху картата">
          {FILTERS.map(({ id, label }) => (
            <button key={id} type="button" aria-pressed={filter === id} onClick={() => chooseFilter(id)} className={filterChip(compact)}>
              {label} <span className="ml-1 opacity-70">{incidents?.payload ? counts[id] : "—"}</span>
            </button>
          ))}
        </div>
      </div>

      <div className={`grid gap-2.5 ${variant === "page" ? "xl:grid-cols-[minmax(0,1.7fr)_minmax(20rem,0.7fr)]" : "lg:grid-cols-[minmax(0,1.55fr)_minmax(19rem,0.85fr)]"}`}>
        <div className={`min-w-0 overflow-hidden rounded-2xl border border-line bg-surface shadow-card ${variant === "modal" && mobileView === "list" ? "hidden lg:block" : ""}`}>
          <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 sm:px-4">
            <div>
              <h3 className="text-sm font-extrabold text-ink sm:text-base">Карта на Пловдив</h3>
              {variant === "page" && <p className="text-xs text-muted">Изберете маркер или преместете картата</p>}
            </div>
            <div className="flex items-center gap-2">
              {variant === "page" && <div className="flex rounded-full border border-line bg-surface-2 p-0.5" role="group" aria-label="Размерност на картата">
                {(["2d", "3d"] as const).map((mode) => <button key={mode} type="button" aria-pressed={mapMode === mode} onClick={() => setMapMode(mode)} className="min-h-11 min-w-11 rounded-full px-3 py-1 text-xs font-extrabold text-muted aria-pressed:bg-surface aria-pressed:text-ink aria-pressed:shadow-card">{mode.toUpperCase()}</button>)}
              </div>}
              {variant === "page" && mapMode === "3d" ? <span className="rounded-full border border-line bg-surface-2 px-3 py-1 text-[11px] font-bold text-muted">Фотореалистичен 3D</span> : <div className="flex rounded-full border border-line bg-surface-2 p-0.5" role="group" aria-label="Визия на картата">
                {(["auto", "day", "night"] as const).map((style) => <button key={style} type="button" aria-pressed={mapStyle === style} onClick={() => setMapStyle(style)} className="min-h-11 min-w-11 rounded-full px-2.5 py-1 text-[11px] font-extrabold text-muted transition-colors aria-pressed:bg-surface aria-pressed:text-ink aria-pressed:shadow-card">{{ auto: "Авто", day: "Ден", night: "Нощ" }[style]}</button>)}
              </div>}
              <span className="hidden rounded-full bg-surface-2 px-3 py-1.5 text-xs font-bold text-ink sm:inline">{incidents?.payload ? eventCount(shown.length) : "Зареждане…"}</span>
            </div>
          </div>
          {variant === "page" && mapMode === "3d" ? <TrafficMap3D
            className="h-[24rem] w-full sm:h-[33rem] xl:h-[38rem]"
            token={cesiumToken}
            focusPosition={focusPosition}
            incidents={shown}
            showFlow={showFlow}
            showMarkers={showMarkers}
            showMotion={showMotion}
            onSelectIncident={(id) => { const item = all.find((candidate) => candidate.id === id); if (item) selectIncident(item); }}
          /> : <TrafficMap
            className={`w-full ${variant === "page" ? "h-[24rem] sm:h-[33rem] xl:h-[38rem]" : "np-traffic-map-modal h-[13rem] sm:h-[19rem] lg:h-[22rem]"}`}
            focusPosition={focusPosition}
            incidents={shown}
            showFlow={showFlow}
            showMarkers={showMarkers}
            showMotion={showMotion}
            mapStyle={mapStyle}
            onSelectIncident={(id) => {
              const item = all.find((candidate) => candidate.id === id);
              if (item) selectIncident(item);
            }}
          />}
          <div className={`flex flex-wrap items-center justify-between gap-2 border-t border-line px-3 text-[11px] text-muted sm:px-4 ${variant === "modal" ? "py-1.5" : "py-2.5"}`}>
            <span>
              {variant === "page" && mapMode === "3d" && showMotion
                ? "3D точките са симулирано движение по OSM пътища и TomTom участъци от инциденти — не са GPS позиции на коли."
                : variant === "page" && mapMode === "3d"
                  ? "Фотореалистичният 3D изглед показва маркери и по избор симулирано движение."
                  : showMotion
                    ? ""
                    : showFlow
                      ? "Цветовете показват натоварването; маркерите следват избрания филтър."
                      : "Трафик потокът е скрит."}
            </span>
            <a href="https://www.tomtom.com/legal/product-attributions/" target="_blank" rel="noopener noreferrer" className="font-semibold text-muted hover:text-link"></a>
          </div>
        </div>

        <aside className={`flex min-w-0 flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-card ${variant === "modal" && mobileView === "map" ? "hidden lg:flex" : ""}`} aria-label="Списък с пътни събития">
          <div className="border-b border-line px-3 py-2.5 sm:px-4">
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="text-sm font-extrabold text-ink sm:text-base">Инциденти и ограничения</h3>
              <span className="text-xs font-bold text-muted">{incidents?.payload ? shown.length : "—"}</span>
            </div>
            <div className="mt-2 flex flex-row gap-2">
              <label className="min-w-0 flex-1">
                <span className="sr-only">Търси улица или събитие</span>
                <input value={query} onChange={(event) => { setQuery(event.target.value); setListPage(0); }} placeholder="Търси улица или събитие…" className="w-full rounded-xl border border-line bg-surface-2 px-3 py-1.5 text-xs text-ink placeholder:text-muted focus:border-accent focus:outline-none" />
              </label>
              <label>
                <span className="sr-only">Подреди събитията</span>
                <select value={sort} onChange={(event) => { setSort(event.target.value as SortOrder); setListPage(0); }} className={`${TRAFFIC_SELECT} min-w-[7.5rem] px-3`}>
                  <option value="newest">По начало</option>
                  <option value="delay">По забавяне</option>
                  <option value="category">По вид</option>
                </select>
              </label>
            </div>
          </div>
          {selected && variant === "page" && <div className="border-b border-line bg-surface-2 px-4 py-3 sm:px-5" aria-live="polite">
            <p className="text-[10px] font-extrabold tracking-[0.14em] text-logo uppercase">Избрано на картата</p>
            <p className="mt-1 text-sm font-extrabold text-ink">{selected.description}</p>
            <p className="mt-1 text-xs text-body">{[selected.from, selected.to].filter(Boolean).join(" → ") || selected.categoryLabel}</p>
            {formatDelay(selected.delaySec) && <p className="mt-1 text-xs font-semibold text-ink">{formatDelay(selected.delaySec)}</p>}
          </div>}
          <div className={variant === "page" ? "np-scroll-soft min-h-0 flex-1 overflow-y-auto max-h-[38rem]" : "min-h-0 flex-1"}>
            {incidents?.message && incidents.payload && <p className="border-b border-line px-4 py-2 text-xs text-muted">{incidents.message}</p>}
            {shown.length === 0 && incidents?.status === "ok" ? (
              <p className="px-5 py-6 text-sm text-body">Няма събития за избраните условия в данните от този източник. Това не означава, че по пътищата няма инциденти.</p>
            ) : !incidents?.payload ? (
              <p className="px-5 py-6 text-sm text-muted">{incidents?.message ?? "Зареждане на инцидентите…"}</p>
            ) : (
              <ul className="divide-y divide-line">
                {visibleIncidents.map((item) => (
                  <li key={item.id}>
                    <button type="button" disabled={!item.position} aria-pressed={selectedId === item.id} onClick={() => selectIncident(item)} className={`group w-full text-left transition-colors hover:bg-surface-2 disabled:cursor-default aria-pressed:bg-surface-2 ${variant === "modal" ? "px-3 py-2 sm:px-4" : "px-4 py-3 sm:px-5"}`}>
                      <span className="block text-[10px] font-extrabold tracking-[0.1em] text-logo uppercase">{item.categoryLabel}</span>
                      <span className="mt-0.5 block text-xs font-bold leading-snug text-ink sm:text-sm">{item.description}</span>
                      {item.from && <span className="mt-0.5 block truncate text-[11px] text-muted">{item.from}{item.to && item.to !== item.from ? ` → ${item.to}` : ""}</span>}
                      {formatDelay(item.delaySec) && <span className="mt-0.5 block text-[11px] text-body">{formatDelay(item.delaySec)}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {variant === "modal" && <div className="flex items-center justify-between gap-2 border-t border-line bg-surface-2/70 px-3 py-2 sm:px-4">
            <span className="text-[11px] font-semibold text-muted">{shown.length ? `${safePage * MODAL_PAGE_SIZE + 1}–${Math.min((safePage + 1) * MODAL_PAGE_SIZE, shown.length)} от ${shown.length}` : "Няма събития"}</span>
            <div className="flex items-center gap-1" aria-label="Страници на събитията">
              <button type="button" aria-label="Предишни събития" disabled={safePage === 0} onClick={() => setListPage(safePage - 1)} className="rounded-lg border border-line bg-surface px-2.5 py-1 text-xs font-bold text-ink disabled:opacity-40">←</button>
              <span className="min-w-10 text-center text-[11px] font-bold text-muted">{safePage + 1}/{pageCount}</span>
              <button type="button" aria-label="Следващи събития" disabled={safePage >= pageCount - 1} onClick={() => setListPage(safePage + 1)} className="rounded-lg border border-line bg-surface px-2.5 py-1 text-xs font-bold text-ink disabled:opacity-40">→</button>
            </div>
          </div>}
        </aside>
      </div>
      {variant === "page" && <p className="px-1 text-xs leading-relaxed text-muted">Показани са събитията, налични за района на Пловдив към часа на обновяване. Картата не е маршрутна навигация; проверете пътната обстановка непосредствено преди пътуване.</p>}
    </section>
  );
}
