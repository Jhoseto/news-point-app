import { searchArticles } from "@/lib/queries";
import { SEARCH_MAX_LENGTH, searchTerms, type SearchHit } from "@/lib/search";

export const dynamic = "force-dynamic";

const LIMIT = 8;

// Public, published content only; a short shared cache keeps typing cheap.
export async function GET(request: Request) {
  const query = (new URL(request.url).searchParams.get("q") ?? "").slice(0, SEARCH_MAX_LENGTH);
  const headers = { "cache-control": "public, max-age=0, s-maxage=30, stale-while-revalidate=60" };
  if (!searchTerms(query).length) return Response.json({ query, hits: [] }, { headers });
  const articles = await searchArticles(query, LIMIT);
  const hits: SearchHit[] = articles.map((article) => ({
    id: article.id,
    path: article.path,
    title: article.title,
    category: article.category?.name ?? null,
    image: article.hero?.url ?? null,
    publishedAt: article.publishedAt.toISOString(),
  }));
  return Response.json({ query, hits }, { headers });
}
