import { readIndexNowConfig } from "@newspoint/content/indexnow";

export const dynamic = "force-dynamic";

/** Root-level proof covers all public article URLs via IndexNow keyLocation. */
export function GET() {
  const config = readIndexNowConfig();
  return new Response(config?.key ?? "Not found", {
    status: config ? 200 : 404,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" },
  });
}
