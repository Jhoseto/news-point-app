import { currentPublicAuthorAvatar } from "@/lib/author-avatar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!id || id.length > 200) return new Response(null, { status: 404, headers: { "cache-control": "no-store" } });
  return (await currentPublicAuthorAvatar(id))
    ?? new Response(null, { status: 404, headers: { "cache-control": "no-store" } });
}
