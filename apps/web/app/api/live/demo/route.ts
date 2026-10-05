import { NextResponse } from "next/server";
import { toLiveCard, type LiveEvent } from "@/lib/live/events";
import { getLiveHub } from "@/lib/live/hub";
import { getLatest } from "@/lib/queries";

export const dynamic = "force-dynamic";

/** Local preview of the live toast/banner. Disabled in production. */
export async function POST() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [article] = await getLatest(1);
  if (!article) {
    return NextResponse.json({ error: "No published article in the database" }, { status: 404 });
  }

  const eventId = Date.now();
  const event: LiveEvent = {
    eventId,
    type: "article.published",
    entityId: article.id,
    version: 1,
    occurredAt: new Date().toISOString(),
    layoutVersion: eventId,
    topics: [],
    path: article.path,
    title: article.title,
    card: toLiveCard({
      category: article.category,
      hero: article.hero ? { url: article.hero.url, alt: article.hero.alt ?? "" } : null,
      publishedAt: article.publishedAt,
    }),
  };

  getLiveHub().broadcastSynthetic(event);

  return NextResponse.json({
    ok: true,
    eventId,
    title: article.title,
    hint: "Open the site in a tab with an active /api/live/ connection (any page with LiveUpdates).",
  });
}
