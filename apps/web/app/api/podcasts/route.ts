import { publicEpisodes } from "@/lib/podcasts";

export const dynamic = "force-dynamic";

export async function GET() {
  const episodes = await publicEpisodes();
  return Response.json({ episodes }, { headers: { "cache-control": "public, max-age=0, s-maxage=60, stale-while-revalidate=60" } });
}
