/**
 * Pure helpers for the podcast desk (testable without React or jsdom).
 * The component imports these so the implementation and the tests share a
 * single source of truth.
 */

import type { EpisodeDraft, EpisodeFilter, StudioEpisode } from "./podcast-desk-types";

export function clock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function bytesText(n: number): string {
  if (!n) return "—";
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

const BG_DATE = new Intl.DateTimeFormat("bg-BG", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "Europe/Sofia",
});

const BG_DATE_LONG = new Intl.DateTimeFormat("bg-BG", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Europe/Sofia",
});

export function shortDate(iso: string | null): string {
  if (!iso) return "—";
  return BG_DATE.format(new Date(iso));
}

export function longDate(iso: string | null): string {
  if (!iso) return "—";
  return BG_DATE_LONG.format(new Date(iso));
}

export function filterEpisodes(
  episodes: StudioEpisode[],
  filter: EpisodeFilter,
  query: string,
): StudioEpisode[] {
  const q = query.trim().toLowerCase();
  return episodes
    .filter((episode) => filter === "all" || episode.status === filter)
    .filter((episode) => !q || episode.title.toLowerCase().includes(q) || episode.slug.includes(q));
}

export function isNewEpisodeValid(draft: EpisodeDraft): boolean {
  return Boolean(
    draft.coverFile &&
      draft.audioFile &&
      draft.title.trim().length >= 2 &&
      draft.summary.trim().length >= 1,
  );
}

export function isEditorDirty(current: { title: string; summary: string; categoryId: string | null }, original: StudioEpisode): boolean {
  return (
    current.title.trim() !== original.title ||
    current.summary.trim() !== original.summary ||
    (current.categoryId || null) !== original.categoryId
  );
}

export function sortByPublishedAtDesc(episodes: StudioEpisode[]): StudioEpisode[] {
  return episodes.slice().sort((a, b) => {
    const aTime = a.publishedAt ?? "";
    const bTime = b.publishedAt ?? "";
    return bTime.localeCompare(aTime);
  });
}