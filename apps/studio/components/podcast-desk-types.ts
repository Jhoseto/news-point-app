/** Shared types for the podcast desk. */

export type StudioEpisode = {
  id: string;
  title: string;
  slug: string;
  summary: string;
  coverKey: string;
  durationSec: number;
  bytes: number;
  categoryId: string | null;
  categoryName: string | null;
  status: "draft" | "published";
  publishedAt: string | null;
};

export type Category = { id: string; name: string };

export type EpisodeFilter = "all" | "published" | "draft";

export type EpisodeDraft = {
  title: string;
  summary: string;
  categoryId: string;
  coverFile: File | null;
  audioFile: File | null;
};