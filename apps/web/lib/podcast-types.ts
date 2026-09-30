export type PublicEpisode = {
  id: string;
  title: string;
  slug: string;
  path: string;
  summary: string;
  coverUrl: string;
  audioUrl: string;
  durationSec: number;
  publishedAt: string;
  categoryName: string | null;
};
