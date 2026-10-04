"use client";

import { useState } from "react";
import { PodcastDesk, type Category, type StudioEpisode } from "./podcast-desk";
import { AiPodcastStudio } from "./ai-podcast-studio";

type Tab = "episodes" | "studio" | "library" | "music";

export function PodcastWorkspace({ initial, categories, webUrl, role }: { initial: StudioEpisode[]; categories: Category[]; webUrl: string; role: string }) {
  const [tab, setTab] = useState<Tab>("episodes");
  const [openProjectId, setOpenProjectId] = useState<string | null>(null);
  const aiAllowed = ["editor", "admin", "master_admin"].includes(role);
  return <div>
    <nav className="mb-5 flex flex-wrap gap-2" aria-label="Подкасти">
      {([ ["episodes", "Епизоди"], ...(aiAllowed ? [["studio", "AI Studio"], ["library", "Подготвени и генерирани"], ["music", "Музикална библиотека"]] : []) ] as Array<[Tab, string]>).map(([value, label]) =>
        <button key={value} type="button" aria-current={tab === value ? "page" : undefined} onClick={() => setTab(value)}
          className={`rounded-full border px-4 py-2 text-sm font-bold transition ${tab === value ? "border-accent bg-accent text-white" : "border-line bg-surface text-body hover:border-accent"}`}>{label}</button>)}
    </nav>
    {tab === "episodes" || !aiAllowed ? <PodcastDesk initial={initial} categories={categories} webUrl={webUrl} /> : <AiPodcastStudio key={tab} mode={tab} categories={categories} webUrl={webUrl} role={role} openProjectId={openProjectId} onOpenProject={(id) => { setOpenProjectId(id); setTab("studio"); }} />}
  </div>;
}
