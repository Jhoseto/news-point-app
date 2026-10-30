import { llmsText } from "@/lib/discovery";
import { getLatest, getPublishedStoryThemes } from "@/lib/queries";
import { shareOrigin } from "@/lib/share-card";
import { cityDiscoveryPages } from "@/lib/city-guide/seo-server";

export const revalidate = 60;

export async function GET() {
  const [articles, themes, city] = await Promise.all([getLatest(12), getPublishedStoryThemes({ limit: 12 }), cityDiscoveryPages()]);
  return new Response(llmsText(shareOrigin(), articles, themes, city), { headers: { "content-type": "text/plain; charset=utf-8" } });
}
