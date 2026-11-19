"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getPlayableCameras } from "@/lib/livepoint/cameras/catalog";
import type { CameraPlaybackState } from "@/lib/livepoint/cameras/playback-state";
import type { CameraEntry } from "@/lib/livepoint/types";
import { useCookieConsent } from "../cookie-consent-store";
import { ChevronLeftIcon, ChevronRightIcon } from "../icons";
import { CameraLiveEmbed } from "./camera-live-embed";
import "./cameras-panel.css";

type CameraGroup = "all" | "plovdiv" | "pamporovo" | "bansko" | "roads";
const GROUPS: { id: CameraGroup; label: string }[] = [
  { id: "all", label: "Всички" },
  { id: "plovdiv", label: "Пловдив" },
  { id: "pamporovo", label: "Пампорово" },
  { id: "bansko", label: "Банско" },
  { id: "roads", label: "Пътища" },
];
const CAMERAS = getPlayableCameras();

function cameraGroup(camera: CameraEntry): Exclude<CameraGroup, "all"> {
  if (camera.group) return camera.group;
  if (camera.slug.startsWith("pamporovo")) return "pamporovo";
  if (camera.slug.startsWith("bansko")) return "bansko";
  if (camera.slug.startsWith("sba-") || camera.slug.startsWith("sofia-")) return "roads";
  return "plovdiv";
}

function usePageSize(variant: "panel" | "page") {
  const [size, setSize] = useState(5);
  const listRef = useRef<HTMLUListElement>(null);
  useEffect(() => {
    const update = () => {
      if (window.innerWidth < 700) {
        setSize(window.innerHeight < 650 ? 1 : window.innerHeight < 740 ? 2 : 3);
      } else if (variant === "panel" && listRef.current) {
        // The anchored panel can be shorter than the viewport. Fit its actual rail.
        const available = listRef.current.getBoundingClientRect().height;
        setSize(Math.max(1, Math.min(5, Math.floor((available + 2) / 66))));
      } else {
        setSize(5);
      }
    };
    update();
    const observer = new ResizeObserver(update);
    if (listRef.current) observer.observe(listRef.current);
    window.addEventListener("resize", update);
    return () => { observer.disconnect(); window.removeEventListener("resize", update); };
  }, [variant]);
  return { pageSize: size, listRef };
}

const PLAYBACK_LABELS: Record<CameraPlaybackState, string> = {
  loading: "Свързване",
  playing: "На живо",
  stalled: "Изчакване на картина",
  unavailable: "Временно недостъпна",
  ready: "Видео",
};

function CameraPlayerBlock({ camera }: { camera: CameraEntry }) {
  const [state, setState] = useState<CameraPlaybackState>("loading");
  const allowed = useCookieConsent().record?.external === true;
  const label = !allowed ? "Изисква съгласие" : state === "ready" && camera.streamStatus === "snapshot" ? "Обновявани снимки" : PLAYBACK_LABELS[state];
  return (
    <section className="np-camera-stage" aria-label={camera.name} data-cookie-focus-fallback tabIndex={-1}>
      <header className="np-camera-heading">
        <div>
          <h3>{camera.name}</h3>
          <p>{camera.place}{camera.direction ? `, ${camera.direction}` : ""}</p>
        </div>
        <span className="np-camera-status" data-state={allowed ? state : "consent"} role="status">
          <span aria-hidden="true" />{label}
        </span>
      </header>
      <div className="np-camera-screen">
        <CameraLiveEmbed
          title={camera.name}
          embedUrl={camera.embedUrl!}
          sourceUrl={camera.sourceUrl}
          kind={camera.streamStatus === "snapshot" ? "snapshot" : "iframe"}
          eager
          onPlaybackState={setState}
        />
      </div>
    </section>
  );
}

export function CamerasPanel({ variant = "page" }: { variant?: "panel" | "page" }) {
  const [group, setGroup] = useState<CameraGroup>("all");
  const [selected, setSelected] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const { pageSize, listRef } = usePageSize(variant);
  const cameras = useMemo(() => CAMERAS.filter((camera) => group === "all" || cameraGroup(camera) === group), [group]);
  const groups = GROUPS.filter(({ id }) => id === "all" || CAMERAS.some((camera) => cameraGroup(camera) === id));
  const active = cameras.find((camera) => camera.slug === selected) ?? cameras[0];
  const pages = Math.max(1, Math.ceil(cameras.length / pageSize));
  const currentPage = Math.min(page, pages - 1);
  const shown = cameras.slice(currentPage * pageSize, (currentPage + 1) * pageSize);

  if (!active) return <p className="np-camera-empty" role="status">В момента няма достъпни камери.</p>;

  return (
    <div className={`np-camera-workspace np-camera-workspace--${variant}`}>
      <CameraPlayerBlock key={active.slug} camera={active} />
      <aside className="np-camera-selector" aria-label="Избор на камера">
        <div className="np-camera-selector-heading"><h3>Камери</h3><span>{cameras.length}</span></div>
        <div className="np-camera-groups" role="group" aria-label="Район на камерите">
          {groups.map(({ id, label }) => (
            <button key={id} type="button" aria-pressed={group === id} onClick={() => { setGroup(id); setPage(0); setSelected(null); }}>
              {label}
            </button>
          ))}
        </div>
        <ul ref={listRef} className="np-camera-list">
          {shown.map((camera) => (
            <li key={camera.slug}>
              <button type="button" aria-pressed={camera.slug === active.slug} onClick={() => setSelected(camera.slug)}>
                <span className="np-camera-row-mark" aria-hidden="true" />
                <span className="np-camera-row-copy"><strong>{camera.name}</strong><span>{camera.place}</span></span>
                <ChevronRightIcon width={16} height={16} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
        <nav className="np-camera-pagination" aria-label="Страници с камери">
          <button type="button" aria-label="Предишни камери" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}><ChevronLeftIcon width={18} height={18} /></button>
          <span aria-live="polite">{currentPage * pageSize + 1}–{Math.min((currentPage + 1) * pageSize, cameras.length)} от {cameras.length}</span>
          <button type="button" aria-label="Следващи камери" disabled={currentPage + 1 >= pages} onClick={() => setPage(currentPage + 1)}><ChevronRightIcon width={18} height={18} /></button>
        </nav>
      </aside>
    </div>
  );
}
