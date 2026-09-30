import { podcastsReady, publishedPodcastAudio } from "@newspoint/db/podcasts";
import { z } from "zod";
import { podcastAudioResponse } from "@/lib/podcast-stream";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!z.uuid().safeParse(id).success || !await podcastsReady()) return new Response("Not found", { status: 404 });
  const episode = await publishedPodcastAudio(id);
  if (!episode) return new Response("Not found", { status: 404 });
  const download = new URL(request.url).searchParams.get("download") === "1";
  const name = download ? `${episode.slug}.mp3` : null;
  return podcastAudioResponse(episode.audioKey, request.headers.get("range"), name);
}
