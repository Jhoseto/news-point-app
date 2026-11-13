import "server-only";
import { podcastRevalidationPaths, triggerRevalidate } from "@newspoint/content";

export async function refreshPodcastPages(slug: string | null): Promise<boolean> {
  return (await triggerRevalidate(podcastRevalidationPaths(slug))).reason === "ok";
}
