import { and, eq, lte, sql } from "drizzle-orm";
import { articles, categories, getDb, mediaAssets } from "@newspoint/db";
import { resolveMediaUrl } from "@newspoint/content";
import { absoluteMedia, shareCard, shareOrigin } from "@/lib/share-card";

const ACCENTS: Record<string, string> = {
  plovdiv: "#1396a3", "regionalni-novini": "#26936e", balgariya: "#5142d5", politika: "#7650c8",
  "kriminalni-novini": "#d57546", "ot-soczialnite-mrezhi": "#b75f9c", "svetovni-novini": "#3b78d1",
  "sportni-novini": "#289b65", tehnologii: "#2794b4", "biznes-novini": "#b58533", zdrave: "#299c82",
  kultura: "#a365c1", lajfstajl: "#ca6999", izbori: "#7566d6",
};

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response(null, { status: 404 });
  const [row] = await getDb()
    .select({
      title: articles.title,
      isPublic: articles.isPublic,
      categoryName: categories.name,
      categorySlug: categories.slug,
      provider: mediaAssets.provider,
      sourceUrl: mediaAssets.sourceUrl,
      storageKey: mediaAssets.storageKey,
    })
    .from(articles)
    .leftJoin(categories, eq(categories.id, articles.primaryCategoryId))
    .leftJoin(mediaAssets, eq(mediaAssets.id, articles.heroMediaId))
    .where(and(eq(articles.id, id), eq(articles.isPublic, true), lte(articles.publishedAt, sql`now()`)))
    .limit(1);
  if (!row?.isPublic) return new Response(null, { status: 404 });
  const origin = shareOrigin();
  const image = row.provider ? absoluteMedia(resolveMediaUrl({ provider: row.provider, sourceUrl: row.sourceUrl, storageKey: row.storageKey }), origin) : null;
  const png = await shareCard({
    title: row.title,
    kicker: row.categoryName ?? "Новини",
    color: (row.categorySlug && ACCENTS[row.categorySlug]) || "#5b6cff",
    imageUrl: image,
  });
  return new Response(new Uint8Array(png), { headers: { "content-type": "image/png", "cache-control": "public, max-age=300" } });
}
