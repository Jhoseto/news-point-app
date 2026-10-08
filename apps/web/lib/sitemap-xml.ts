export const SITEMAP_PAGE_SIZE = 10_000;
export type SitemapKind = "articles" | "themes" | "podcasts";
export interface SitemapEntry { path: string; updatedAt?: Date | string | null }

export function xmlEscape(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[char]!);
}

export function sitemapFiles(counts: Record<SitemapKind, number>): string[] {
  return ["pages.xml", ...(["articles", "themes", "podcasts"] as const).flatMap((kind) =>
    Array.from({ length: Math.ceil(counts[kind] / SITEMAP_PAGE_SIZE) }, (_, index) => `${kind}-${index}.xml`))];
}

export function parseSitemapFile(file: string): { kind: SitemapKind; page: number } | null {
  const match = /^(articles|themes|podcasts)-(0|[1-9]\d*)\.xml$/.exec(file);
  if (!match) return null;
  const page = Number(match[2]);
  return Number.isSafeInteger(page) && page <= Math.floor(Number.MAX_SAFE_INTEGER / SITEMAP_PAGE_SIZE)
    ? { kind: match[1] as SitemapKind, page } : null;
}

export function sitemapIndexXml(origin: string, files: string[]): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${files.map((file) => `<sitemap><loc>${xmlEscape(`${origin}/sitemaps/${file}`)}</loc></sitemap>`).join("")}</sitemapindex>`;
}

export function sitemapXml(origin: string, entries: SitemapEntry[]): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries.map((entry) => {
    const lastModified = entry.updatedAt ? new Date(entry.updatedAt).toISOString() : null;
    return `<url><loc>${xmlEscape(`${origin}${entry.path}`)}</loc>${lastModified ? `<lastmod>${lastModified}</lastmod>` : ""}</url>`;
  }).join("")}</urlset>`;
}
