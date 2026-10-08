import { studioOrigins } from "@/lib/auth";
import { ensureMediaVariants } from "@/lib/ensure-media-variants";
import { staffFromRequest } from "@/lib/session";

export const runtime = "nodejs";

/** Ensure an archive media asset has the responsive WebP ladder before use. */
export async function POST(request: Request) {
  if (!studioOrigins().trusted.includes(request.headers.get("origin") ?? "")) {
    return Response.json({ error: { message: "Невалиден източник." } }, { status: 403, headers: { "cache-control": "no-store" } });
  }
  const staff = await staffFromRequest(request);
  if (!staff) return Response.json({ error: { message: "Влезте отново." } }, { status: 401, headers: { "cache-control": "no-store" } });

  try {
    const body = (await request.json()) as { id?: unknown };
    const id = typeof body.id === "string" ? body.id.trim() : "";
    if (!id) throw new Error("Липсва идентификатор на снимката.");
    const result = await ensureMediaVariants(id);
    return Response.json(result, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return Response.json(
      { error: { message: error instanceof Error ? error.message : "Оптимизацията не беше успешна." } },
      { status: 400, headers: { "cache-control": "no-store" } },
    );
  }
}
