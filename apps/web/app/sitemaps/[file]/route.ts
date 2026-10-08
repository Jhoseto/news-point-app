import { newsSitemapCount, newsSitemapEntries, sitemapCounts, sitemapEntries, sitemapPages } from "@/lib/sitemaps";
import { NEWS_SITEMAP_PAGE_SIZE, parseSitemapFile, SITEMAP_PAGE_SIZE, sitemapXml } from "@/lib/sitemap-xml";
import { shareOrigin } from "@/lib/share-card";

export const revalidate = 300;

export async function GET(_request: Request, context: { params: Promise<{ file: string }> }) {
  const { file } = await context.params;
  if (file === "pages.xml") return xml(await sitemapPages());
  const parsed = parseSitemapFile(file);
  if (!parsed) return new Response(null, { status: 404 });
  if (parsed.kind === "news") {
    if (parsed.page >= Math.ceil(await newsSitemapCount() / NEWS_SITEMAP_PAGE_SIZE)) return new Response(null, { status: 404 });
    const cutoff = Date.now() - 48 * 60 * 60 * 1000;
    // Cached rows must not keep aged stories in the rolling two-day window.
    return xml((await newsSitemapEntries(parsed.page)).filter((entry) => Date.parse(String(entry.news?.publishedAt)) >= cutoff));
  }
  const counts = await sitemapCounts();
  if (parsed.page >= Math.ceil(counts[parsed.kind] / SITEMAP_PAGE_SIZE)) return new Response(null, { status: 404 });
  return xml(await sitemapEntries(parsed.kind, parsed.page));
}

function xml(entries: Awaited<ReturnType<typeof sitemapPages>>) {
  return new Response(sitemapXml(shareOrigin(), entries), { headers: { "content-type": "application/xml; charset=utf-8" } });
}
