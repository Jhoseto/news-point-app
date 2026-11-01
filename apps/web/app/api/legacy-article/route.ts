import { articles, getDb } from "@newspoint/db";
import { legacyArticleDestination, legacyArticleFilter, legacyArticleId } from "../../../lib/legacy-article-query";

const noStore = { "Cache-Control": "private, no-store" };
const notFound = () => new Response("Not found", { status: 404, headers: { ...noStore, "X-Robots-Tag": "noindex, follow" } });

/** Target of the root WordPress ?p= rewrite; never renders an ID as the homepage. */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const id = legacyArticleId(params);
  if (id === null) return notFound();
  try {
    const [article] = await getDb().select({ path: articles.path }).from(articles).where(legacyArticleFilter(id)).limit(1);
    const destination = article ? legacyArticleDestination(article.path, params) : null;
    if (!destination) return notFound();
    return new Response(null, { status: 301, headers: { ...noStore, Location: destination } });
  } catch {
    // A transient database outage is not evidence that a historical article was deleted.
    return new Response("Temporarily unavailable", { status: 503, headers: { ...noStore, "Retry-After": "60", "X-Robots-Tag": "noindex, follow" } });
  }
}
