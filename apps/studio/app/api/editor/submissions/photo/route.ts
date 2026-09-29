import { readMediaFile } from "@/lib/media-disk";
import { staffFromRequest } from "@/lib/session";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!(await staffFromRequest(request))) return new Response(null, { status: 401 });
  const path = new URL(request.url).searchParams.get("path") ?? "";
  if (!/^[a-f0-9-]+\/[a-f0-9-]+\.webp$/i.test(path)) return new Response(null, { status: 400 });
  const bytes = await readMediaFile(`users/livepoint/${path}`);
  return bytes ? new Response(new Uint8Array(bytes), { headers: { "content-type": "image/webp", "cache-control": "private, no-store" } }) : new Response(null, { status: 404 });
}
