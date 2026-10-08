import { newsSitemapCount, sitemapCounts } from "@/lib/sitemaps";
import { sitemapFiles, sitemapIndexXml } from "@/lib/sitemap-xml";
import { shareOrigin } from "@/lib/share-card";

export const revalidate = 300;

export async function GET() {
  const [counts, news] = await Promise.all([sitemapCounts(), newsSitemapCount()]);
  return new Response(sitemapIndexXml(shareOrigin(), sitemapFiles({ ...counts, news })), { headers: { "content-type": "application/xml; charset=utf-8" } });
}
