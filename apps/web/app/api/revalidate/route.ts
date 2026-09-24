import { timingSafeEqual } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";

export const dynamic = "force-dynamic";

const body = z.strictObject({
  paths: z
    .array(z.string().max(1024).regex(/^\/[^?#\s]*$/, "must be a site path"))
    .min(1)
    .max(20),
});

function authorized(provided: string | null): boolean {
  const expected = process.env.REVALIDATE_SECRET;
  if (!expected || !provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Called by the live dispatcher (lib/live/hub.ts) before it broadcasts an event.
export async function POST(request: Request) {
  if (!authorized(request.headers.get("x-revalidate-secret"))) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }
  for (const path of parsed.data.paths) revalidatePath(path);
  return Response.json({ revalidated: parsed.data.paths.length });
}
