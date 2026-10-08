import { publicEpisode } from "@/lib/podcasts";
import { absoluteMedia, podcastShareCard, shareOrigin } from "@/lib/share-card";

export async function GET(_request: Request, context: { params: Promise<{ slug: string }> }) {
  const episode = await publicEpisode((await context.params).slug);
  if (!episode) return new Response(null, { status: 404 });
  const png = await podcastShareCard({
    title: episode.title,
    durationSec: episode.durationSec,
    categoryName: episode.categoryName,
    imageUrl: absoluteMedia(episode.coverUrl, shareOrigin()),
  });
  return new Response(new Uint8Array(png), {
    headers: {
      "content-type": "image/png",
      "cache-control": "public, max-age=300, stale-while-revalidate=86400",
    },
  });
}
