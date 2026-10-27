import { timingSafeEqual } from "node:crypto";
import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";
import { loadRootEnv } from "@newspoint/db";
import { articleHtmlFlights } from "../../../lib/article-edge-render";
import { purgeArticleEdgePaths } from "../../../lib/article-edge-purge";
import { canonicalArticleCachePath } from "../../../../../packages/content/src/article-edge-cache";

export const dynamic = "force-dynamic";

const body = z.strictObject({
  paths: z
    .array(z.string().max(1024).regex(/^\/[^?#\s]*$/, "must be a site path"))
    .min(1)
    .max(20),
});

function authorized(provided: string | null): boolean {
  loadRootEnv();
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
  articleHtmlFlights.invalidate(parsed.data.paths.flatMap(path => {
    const canonical = canonicalArticleCachePath(path);
    return canonical ? [canonical] : [];
  }));
  for (const path of parsed.data.paths) revalidatePath(path);
  // Article/rubric mutations also write into Data Cache entries tagged below.
  revalidateTag("public-listings", { expire: 0 });
  if (parsed.data.paths.includes("/sitemap.xml")) {
    revalidateTag("public-sitemaps", { expire: 0 });
    revalidatePath("/sitemaps", "layout");
  }
  const edgeCache = await purgeArticleEdgePaths(parsed.data.paths);
  return Response.json({ revalidated: parsed.data.paths.length, edgeCache }, {
    status: edgeCache === "error" ? 503 : 200,
    headers: { "cache-control": "private, no-store" },
  });
}
