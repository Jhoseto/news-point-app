export const SITEMAP_PAGE_SIZE = 10_000;
export const NEWS_SITEMAP_PAGE_SIZE = 1_000;
export type SitemapKind = "articles" | "themes" | "podcasts";
export interface SitemapEntry { path: string; updatedAt?: Date | string | null; news?: { title: string; publishedAt: Date | string } }

export function xmlEscape(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[char]!);
}

export function sitemapFiles(counts: Record<SitemapKind, number> & { news?: number }): string[] {
  return ["pages.xml", ...(["articles", "themes", "podcasts"] as const).flatMap((kind) =>
    Array.from({ length: Math.ceil(counts[kind] / SITEMAP_PAGE_SIZE) }, (_, index) => `${kind}-${index}.xml`)),
    ...Array.from({ length: Math.ceil((counts.news ?? 0) / NEWS_SITEMAP_PAGE_SIZE) }, (_, index) => `news-${index}.xml`)];
}

export function parseSitemapFile(file: string): { kind: SitemapKind | "news"; page: number } | null {
  const match = /^(articles|themes|podcasts|news)-(0|[1-9]\d*)\.xml$/.exec(file);
  if (!match) return null;
  const page = Number(match[2]);
  return Number.isSafeInteger(page) && page <= Math.floor(Number.MAX_SAFE_INTEGER / SITEMAP_PAGE_SIZE)
    ? { kind: match[1] as SitemapKind | "news", page } : null;
}

export function sitemapIndexXml(origin: string, files: string[]): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${files.map((file) => `<sitemap><loc>${xmlEscape(`${origin}/sitemaps/${file}`)}</loc></sitemap>`).join("")}</sitemapindex>`;
}

export function sitemapXml(origin: string, entries: SitemapEntry[]): string {
  const newsNamespace = entries.some((entry) => entry.news) ? ' xmlns:news="http://www.google.com/schemas/sitemap-news/0.9"' : "";
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"${newsNamespace}>${entries.map((entry) => {
    const lastModified = entry.updatedAt ? new Date(entry.updatedAt).toISOString() : null;
    const news = entry.news ? `<news:news><news:publication><news:name>NewsPoint.bg</news:name><news:language>bg</news:language></news:publication><news:publication_date>${new Date(entry.news.publishedAt).toISOString()}</news:publication_date><news:title>${xmlEscape(entry.news.title)}</news:title></news:news>` : "";
    return `<url><loc>${xmlEscape(`${origin}${entry.path}`)}</loc>${lastModified ? `<lastmod>${lastModified}</lastmod>` : ""}${news}</url>`;
  }).join("")}</urlset>`;
}
