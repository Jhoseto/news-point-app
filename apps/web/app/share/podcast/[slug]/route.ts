import { publicEpisode } from "@/lib/podcasts";
import { absoluteMedia, shareCard, shareOrigin } from "@/lib/share-card";

export async function GET(_request: Request, context: { params: Promise<{ slug: string }> }) {
  const episode = await publicEpisode((await context.params).slug);
  if (!episode) return new Response(null, { status: 404 });
  const png = await shareCard({ title: episode.title, kicker: "NewsPodcast", color: "#5b6cff", imageUrl: absoluteMedia(episode.coverUrl, shareOrigin()) });
  return new Response(new Uint8Array(png), { headers: { "content-type": "image/png", "cache-control": "public, max-age=300" } });
}
