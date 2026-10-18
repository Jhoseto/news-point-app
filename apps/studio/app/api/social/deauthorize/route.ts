import { withStaffAudit } from "@/lib/audit";
import { removeFacebookAuthorization } from "@/lib/social-facebook";
async function handlePOST(request: Request) {
  const headers = { "cache-control": "private, no-store" };
  try {
    if (Number(request.headers.get("content-length") ?? 0) > 20000) throw new Error();
    const reader = request.body?.getReader(); if (!reader) throw new Error();
    const chunks: Uint8Array[] = []; let size = 0;
    const timeout = setTimeout(() => { void reader.cancel().catch(() => undefined); }, 5000);
    try {
      for (;;) {
        const next = await reader.read(); if (next.done) break;
        size += next.value.length; if (size > 20000) { await reader.cancel(); throw new Error(); }
        chunks.push(next.value);
      }
    } finally { clearTimeout(timeout); }
    const text = Buffer.concat(chunks).toString("utf8");
    const result = await removeFacebookAuthorization(new URLSearchParams(text).get("signed_request") ?? "");
    return Response.json(result, { headers });
  } catch { return Response.json({ error: "invalid_request" }, { status: 400, headers }); }
}
// Register this signed endpoint for both Meta deauthorization and data deletion callbacks.
export const POST = withStaffAudit(handlePOST);
