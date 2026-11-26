import { unstable_cache } from "next/cache";
import { getQuestionNews } from "@/lib/queries";
import { articleImageAttrs } from "@/lib/article-image";
import { questionNewsTerms, questionNewsContext } from "../../../../../../polit-compass/data/news-terms";

export const dynamic = "force-dynamic";
const loadNews = unstable_cache(async (terms: string[], context: string[]) => {
  const stories = await getQuestionNews(terms, context);
  return stories.map(({ path, title, publishedAt, hero }) => ({
    path, title, publishedAt: publishedAt.toISOString(),
    image: hero ? articleImageAttrs(hero, { sizes: "8rem" }) : null,
  }));
}, ["compass-related-news-v4"], { revalidate: 300 });

export async function GET(_request: Request, { params }: { params: Promise<{ question: string }> }) {
  const headers = { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex" };
  const { question } = await params;
  const terms = questionNewsTerms.get(question);
  if (!terms) return new Response(null, { status: 404, headers });
  try {
    return Response.json(await loadNews(terms, questionNewsContext.get(question) ?? []), { headers });
  } catch {
    return new Response(null, { status: 503, headers });
  }
}
