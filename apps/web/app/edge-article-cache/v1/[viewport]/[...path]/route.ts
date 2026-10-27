import { canonicalArticleCachePath, type ArticleViewport } from "../../../../../../../packages/content/src/article-edge-cache";
import { articleEdgeConfig, articleHtmlFlights, articleRenderHeaders, renderAnonymousArticle } from "../../../../../lib/article-edge-render";
import { getArticleByPath, getCategoryByPath } from "../../../../../lib/queries";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const unavailable = (status: number) => new Response(null, { status, headers: { "cache-control": "private, no-store", "x-robots-tag": "noindex, nofollow" } });
class NotPublicArticle extends Error {}

export async function GET(request: Request, {params}: {params: Promise<{viewport: string; path: string[]}>}) {
  const config = articleEdgeConfig();
  if (!config || request.headers.has("authorization") || request.headers.has("cookie") || new URL(request.url).search) return unavailable(404);
  const {viewport,path:parts} = await params;
  if (viewport !== "desktop" && viewport !== "mobile") return unavailable(404);
  const path = canonicalArticleCachePath(`/${parts.map(encodeURIComponent).join("/")}/`);
  if (!path) return unavailable(404);
  try {
    const result = await articleHtmlFlights.render(path,viewport as ArticleViewport,async () => {
      if (await getCategoryByPath(path)) throw new NotPublicArticle();
      const article = await getArticleByPath(path);
      if (!article || canonicalArticleCachePath(article.path) !== path) throw new NotPublicArticle();
      return renderAnonymousArticle(path,viewport,config);
    });
    return new Response(result.body as BodyInit, { headers: articleRenderHeaders(result.contentType) });
  } catch (error) { return unavailable(error instanceof NotPublicArticle ? 404 : 503); }
}
