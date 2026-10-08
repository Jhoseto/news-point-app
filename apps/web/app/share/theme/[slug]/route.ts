import { getStoryThemeBySlug } from "@/lib/queries";
import { absoluteMedia, shareCard, shareOrigin } from "@/lib/share-card";

export async function GET(_request: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const theme = await getStoryThemeBySlug(slug);
  if (!theme) return new Response(null, { status: 404 });
  const cover = theme.coverUrl || theme.articles.find((article) => article.heroUrl)?.heroUrl;
  const png = await shareCard({ title: theme.title, kicker: "Теми с продължение", color: "#5b6cff", imageUrl: cover ? absoluteMedia(cover, shareOrigin()) : null });
  return new Response(new Uint8Array(png), { headers: { "content-type": "image/png", "cache-control": "public, max-age=300" } });
}
