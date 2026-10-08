import type { MetadataRoute } from "next";
import { PUBLIC_SEO_PAGES } from "./public-metadata";

export function discoveryRobots(origin: string): MetadataRoute.Robots {
  // Crawlers must be able to read noindex on public pages. Do not hide archive URLs here.
  return { rules: { userAgent: "*", allow: "/", disallow: ["/admin/", "/api/", "/draft/"] }, sitemap: `${origin}/sitemap.xml` };
}

function link(origin: string, path: string, title: string): string {
  const label = title.replace(/\s+/g, " ").replace(/[\\[\]]/g, "\\$&");
  return `- [${label}](<${origin}${path}>)`;
}

export function llmsText(origin: string, articles: { path: string; title: string }[], themes: { slug: string; title: string }[]): string {
  return [
    "# NewsPoint.bg", "",
    "> Независим новинарски портал за Пловдив, България и света. Публикациите са на български език.", "",
    "Статиите съдържат заглавие, автор, дата и текст в публичния HTML. Каноничният адрес е посочен на всяка публикация. Темите с продължение обединяват свързани новини в редактирана хронология.", "",
    "## За медията", "",
    ...(["home", "team", "contacts", "advertising"] as const).map((key) => link(origin, PUBLIC_SEO_PAGES[key].path, PUBLIC_SEO_PAGES[key].title)), "",
    "## Откриване на публикации", "",
    link(origin, "/sitemap.xml", "Sitemap индекс — всички публични канонични адреси"),
    link(origin, "/feed/", "RSS — последни новини с дата и резюме"),
    link(origin, "/temi/", "Теми с продължение"),
    link(origin, "/livepoint/podcast/", "NewsPodcast"), "",
    ...(themes.length ? ["## Публикувани теми", "", ...themes.map((theme) => link(origin, `/temi/${theme.slug}/`, theme.title)), ""] : []),
    ...(articles.length ? ["## Последни публикации", "", ...articles.map((article) => link(origin, article.path, article.title)), ""] : []),
  ].join("\n");
}
