import { llmsText } from "@/lib/discovery";
import { getLatest, getPublishedStoryThemes } from "@/lib/queries";
import { shareOrigin } from "@/lib/share-card";

export const revalidate = 60;

export async function GET() {
  const [articles, themes] = await Promise.all([getLatest(12), getPublishedStoryThemes({ limit: 12 })]);
  return new Response(llmsText(shareOrigin(), articles, themes), { headers: { "content-type": "text/plain; charset=utf-8" } });
}
