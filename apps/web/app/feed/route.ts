import { desc, eq, sql } from "drizzle-orm";
import { articles, categories, getDb } from "@newspoint/db";
import { menuName } from "@newspoint/content";
import { shareOrigin } from "@/lib/share-card";

export const revalidate = 300;

function xml(value: string): string {
  return value.replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char] ?? char);
}

export async function GET() {
  const origin = shareOrigin();
  const rows = await getDb()
    .select({
      title: articles.title,
      path: articles.path,
      excerpt: articles.excerpt,
      publishedAt: articles.publishedAt,
      categoryName: categories.name,
      categorySlug: categories.slug,
    })
    .from(articles)
    .leftJoin(categories, eq(categories.id, articles.primaryCategoryId))
    .where(sql`${articles.isPublic} and ${articles.publishedAt} <= now()`)
    .orderBy(desc(articles.publishedAt))
    .limit(40);
  const items = rows.map((row) => `    <item>
      <title>${xml(row.title)}</title>
      <link>${xml(`${origin}${row.path}`)}</link>
      <guid>${xml(`${origin}${row.path}`)}</guid>
      <pubDate>${row.publishedAt?.toUTCString() ?? ""}</pubDate>
      <description>${xml(row.excerpt)}</description>
      <category>${xml(row.categorySlug ? menuName(row.categorySlug, row.categoryName ?? "") : "Новини")}</category>
    </item>`).join("\n");
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>NewsPoint.bg</title>
    <link>${xml(origin)}/</link>
    <description>Новини от Пловдив, България и света.</description>
    <language>bg</language>
${items}
  </channel>
</rss>`;
  return new Response(body, { headers: { "content-type": "application/rss+xml; charset=utf-8", "cache-control": "public, max-age=300" } });
}
