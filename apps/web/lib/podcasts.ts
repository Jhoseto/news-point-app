import "server-only";
import { listPublishedPodcasts, podcastsReady, publishedPodcastBySlug } from "@newspoint/db/podcasts";
import type { PublicEpisode } from "./podcast-types";

export type { PublicEpisode };

function present(row: {
  id: string;
  title: string;
  slug: string;
  summary: string;
  coverKey: string;
  durationSec: number;
  publishedAt: Date | null;
  createdAt: Date;
  categoryName: string | null;
}): PublicEpisode {
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    path: `/livepoint/podcast/${row.slug}/`,
    summary: row.summary,
    coverUrl: `/media/${row.coverKey}`,
    audioUrl: `/podcast-audio/${row.id}/`,
    durationSec: row.durationSec,
    publishedAt: (row.publishedAt ?? row.createdAt).toISOString(),
    categoryName: row.categoryName,
  };
}

export async function publicEpisodes(): Promise<PublicEpisode[]> {
  if (!await podcastsReady()) return [];
  return (await listPublishedPodcasts()).map(present);
}

export async function publicEpisode(slug: string): Promise<PublicEpisode | null> {
  if (!await podcastsReady()) return null;
  const row = await publishedPodcastBySlug(slug);
  return row ? present(row) : null;
}
