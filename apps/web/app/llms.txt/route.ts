import { llmsText } from "@/lib/discovery";
import { getLatest, getPublishedStoryThemes } from "@/lib/queries";
import { shareOrigin } from "@/lib/share-card";
import { cityDiscoveryPages } from "@/lib/city-guide/seo-server";
import { publicEpisodeLinks } from "@/lib/podcasts";

export const revalidate = 60;

export async function GET() {
  const [articles, themes, city, episodes] = await Promise.all([
    getLatest(12), getPublishedStoryThemes({ limit: 12 }), cityDiscoveryPages(), publicEpisodeLinks(),
  ]);
  return new Response(llmsText(shareOrigin(), articles, themes, city, episodes), { headers: { "content-type": "text/plain; charset=utf-8" } });
}
