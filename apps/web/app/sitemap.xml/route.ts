import { newsSitemapCount, sitemapCounts } from "@/lib/sitemaps";
import { sitemapFiles, sitemapIndexXml } from "@/lib/sitemap-xml";
import { shareOrigin } from "@/lib/share-card";
import { citySearchPublished } from "@/lib/city-guide/seo-server";

export const revalidate = 300;

export async function GET() {
  const [counts, news] = await Promise.all([sitemapCounts(), newsSitemapCount()]);
  const files = sitemapFiles({ ...counts, news });
  if (citySearchPublished()) files.push("city.xml");
  return new Response(sitemapIndexXml(shareOrigin(), files), { headers: { "content-type": "application/xml; charset=utf-8" } });
}
