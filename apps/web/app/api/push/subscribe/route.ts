import { handlePushRequest } from "@/lib/push-api";

export const dynamic = "force-dynamic";
export const POST = handlePushRequest;

// Status and unsubscribe also require the browser keys in a POST body.
export function DELETE() {
  return Response.json({ error: "Use authenticated device action" }, { status: 405,
    headers: { Allow: "POST", "Cache-Control": "private, no-store" } });
}
