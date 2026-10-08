import { PUBLIC_SEO_PAGES } from "@/lib/public-metadata";
import { absoluteMedia, shareCard, shareOrigin } from "@/lib/share-card";

export async function GET(_request: Request, context: { params: Promise<{ key: string }> }) {
  const { key } = await context.params;
  if (!Object.hasOwn(PUBLIC_SEO_PAGES, key)) return new Response(null, { status: 404 });
  const page = PUBLIC_SEO_PAGES[key as keyof typeof PUBLIC_SEO_PAGES];
  const png = await shareCard({ title: page.title, kicker: "NewsPoint.bg", color: "#5b6cff", imageUrl: "image" in page ? absoluteMedia(page.image, shareOrigin()) : null });
  return new Response(new Uint8Array(png), { headers: { "content-type": "image/png", "cache-control": "public, max-age=300" } });
}
