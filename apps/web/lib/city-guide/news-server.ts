import "server-only";
import { getByCategory, getCityEventContext, getCityGuideContext, getLatest, getMenuCategories, type ArticleSummary } from "@/lib/queries";

/** Re-evaluate published NewsPoint headlines at most every four hours per Web process. */
export const CITY_NEWS_REFRESH_MS = 4 * 60 * 60 * 1000;
let snapshot: { articles: ArticleSummary[]; expiresAt: number } | null = null;
let pending: Promise<ArticleSummary[]> | null = null;

async function fetchCityArticlePool(): Promise<ArticleSummary[]> {
  const menu = await getMenuCategories();
  const local = menu.find(item => item.slug === "plovdiv");
  const culture = menu.find(item => item.slug === "kultura");
  const [localArticles, cultureArticles, latestArticles, eventArticles, guideArticles] = await Promise.all([
    local ? getByCategory(local.id, 320) : Promise.resolve([]),
    culture ? getByCategory(culture.id, 120) : Promise.resolve([]),
    getLatest(250),
    getCityEventContext(),
    getCityGuideContext(),
  ]);
  const byId = new Map<string, ArticleSummary>();
  for (const article of guideArticles) byId.set(article.id, article);
  for (const article of eventArticles) byId.set(article.id, article);
  for (const article of localArticles) byId.set(article.id, article);
  for (const article of cultureArticles) {
    if (/пловдив/i.test(`${article.title} ${article.excerpt}`)) byId.set(article.id, article);
  }
  for (const article of latestArticles) {
    if (/пловдив/i.test(`${article.title} ${article.excerpt}`)) byId.set(article.id, article);
  }
  return [...byId.values()].sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());
}

/** A request after the four-hour boundary starts one shared refresh; failures show no stale claims. */
export async function loadCityArticlePool(): Promise<ArticleSummary[]> {
  if (snapshot && Date.now() < snapshot.expiresAt) return snapshot.articles;
  if (pending) return pending;
  pending = fetchCityArticlePool().then(articles => {
    snapshot = { articles, expiresAt: Date.now() + CITY_NEWS_REFRESH_MS };
    return articles;
  }).catch(() => {
    snapshot = { articles: [], expiresAt: Date.now() + 5 * 60 * 1000 };
    return [];
  }).finally(() => { pending = null; });
  return pending;
}
