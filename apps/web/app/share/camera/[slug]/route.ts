import { getCamera } from "@/lib/livepoint/cameras/catalog";
import { shareCard } from "@/lib/share-card";

export async function GET(_request: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const camera = getCamera(slug);
  if (!camera) return new Response(null, { status: 404 });
  const png = await shareCard({ title: camera.name, kicker: "Камери · LivePoint", color: "#1396a3" });
  return new Response(new Uint8Array(png), { headers: { "content-type": "image/png", "cache-control": "public, max-age=300" } });
}
