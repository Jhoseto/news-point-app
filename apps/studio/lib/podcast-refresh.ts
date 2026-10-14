import "server-only";
import { triggerRevalidate } from "@newspoint/content";

export async function refreshPodcastPages(slug: string | null): Promise<boolean> {
  const paths = ["/", "/livepoint/podcast/", "/feed/", "/sitemap.xml"];
  if (slug) paths.push(`/livepoint/podcast/${slug}/`, `/share/podcast/${slug}/`);
  return (await triggerRevalidate(paths)).reason === "ok";
}
