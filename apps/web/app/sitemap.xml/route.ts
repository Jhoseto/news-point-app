import { sitemapCounts } from "@/lib/sitemaps";
import { sitemapFiles, sitemapIndexXml } from "@/lib/sitemap-xml";
import { shareOrigin } from "@/lib/share-card";

export const revalidate = 3600;

export async function GET() {
  return new Response(sitemapIndexXml(shareOrigin(), sitemapFiles(await sitemapCounts())), { headers: { "content-type": "application/xml; charset=utf-8" } });
}
