"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CAMERA_CATALOG } from "@/lib/livepoint/cameras/catalog";
import type { CameraCategory, CameraEntry } from "@/lib/livepoint/types";
import { Choice } from "./livepoint-field";

const CATEGORIES: { id: CameraCategory | "all"; label: string }[] = [
  { id: "all", label: "Всички" },
  { id: "traffic", label: "Трафик" },
  { id: "city", label: "Град" },
  { id: "region", label: "Регион" },
];

function CameraTile({ camera, selected, onSelect }: { camera: CameraEntry; selected: boolean; onSelect: () => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        className={`group relative isolate flex aspect-[16/10] w-full overflow-hidden rounded-2xl text-left transition ${
          selected ? "ring-2 ring-logo ring-offset-2 ring-offset-surface" : ""
        }`}
      >
        <span className="np-img-empty absolute inset-0" aria-hidden="true" />
        <span className="absolute inset-0 bg-gradient-to-t from-[#050b22]/80 via-[#050b22]/15 to-transparent" aria-hidden="true" />
        <span className="relative mt-auto flex w-full flex-col gap-0.5 p-3 text-white">
          <span className="text-sm font-extrabold tracking-tight">{camera.name}</span>
          <span className="text-xs font-medium text-white/75">
            {camera.place}
            {camera.direction ? ` · ${camera.direction}` : ""}
          </span>
        </span>
      </button>
    </li>
  );
}

export function CamerasPanel() {
  const [category, setCategory] = useState<CameraCategory | "all">("all");
  const [selected, setSelected] = useState<string | null>(null);

  const cameras = useMemo(
    () => (category === "all" ? CAMERA_CATALOG : CAMERA_CATALOG.filter((c) => c.category === category)),
    [category],
  );
  const active: CameraEntry | undefined = cameras.find((c) => c.slug === selected);

  return (
    <div className="flex flex-col gap-4">
      <Choice
        name="Категория"
        value={category}
        options={CATEGORIES}
        onChange={(next) => {
          setCategory(next);
          setSelected(null);
        }}
      />

      <ul className="grid gap-3 sm:grid-cols-2">
        {cameras.map((camera) => (
          <CameraTile
            key={camera.slug}
            camera={camera}
            selected={selected === camera.slug}
            onSelect={() => setSelected((current) => (current === camera.slug ? null : camera.slug))}
          />
        ))}
      </ul>

      {active ? (
        <div className="border-t border-line pt-4">
          <h3 className="text-base font-extrabold text-ink">{active.name}</h3>
          <p className="mt-1 text-sm text-muted">
            {active.owner} · проверена {active.lastChecked}
          </p>
          {active.notes ? <p className="mt-2 text-sm text-body">{active.notes}</p> : null}
          {active.streamStatus !== "verified" ? (
            <p className="mt-2 text-sm text-body">Потокът още не е проверен от нас — гледа се при източника.</p>
          ) : null}
          {active.access === "iframe" && active.embedUrl && active.streamStatus === "verified" ? (
            <iframe
              title={active.name}
              src={active.embedUrl}
              className="mt-3 aspect-video w-full rounded-2xl border border-line"
              allow="autoplay; fullscreen"
            />
          ) : (
            <a
              href={active.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-flex rounded-full bg-logo px-4 py-2 text-sm font-bold text-white"
            >
              Отвори оригиналната страница
            </a>
          )}
          <Link href={`/livepoint/cameras/${active.slug}/`} className="mt-3 ml-3 inline-flex text-sm font-semibold text-link">
            Детайл в LivePoint
          </Link>
        </div>
      ) : (
        <p className="text-sm text-muted">Изберете място. Поток се зарежда само за избраната камера.</p>
      )}
    </div>
  );
}
