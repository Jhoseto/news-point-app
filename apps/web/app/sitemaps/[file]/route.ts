import { sitemapCounts, sitemapEntries, sitemapPages } from "@/lib/sitemaps";
import { parseSitemapFile, SITEMAP_PAGE_SIZE, sitemapXml } from "@/lib/sitemap-xml";
import { shareOrigin } from "@/lib/share-card";

export const revalidate = 3600;

export async function GET(_request: Request, context: { params: Promise<{ file: string }> }) {
  const { file } = await context.params;
  if (file === "pages.xml") return xml(await sitemapPages());
  const parsed = parseSitemapFile(file);
  if (!parsed) return new Response(null, { status: 404 });
  const counts = await sitemapCounts();
  if (parsed.page >= Math.ceil(counts[parsed.kind] / SITEMAP_PAGE_SIZE)) return new Response(null, { status: 404 });
  return xml(await sitemapEntries(parsed.kind, parsed.page));
}

function xml(entries: Awaited<ReturnType<typeof sitemapPages>>) {
  return new Response(sitemapXml(shareOrigin(), entries), { headers: { "content-type": "application/xml; charset=utf-8" } });
}
