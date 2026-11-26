import { compareRequest } from "../../../../../polit-compass/server/comparison.mjs";
import { localCompassAllowed } from "../access";

export const dynamic = "force-dynamic";

async function handle(request: Request) {
  const origin = localCompassAllowed(request.headers) ? "http://localhost:3000" : "https://newspoint.bg";
  const response = await compareRequest(request, async (text, values) => {
    const { getDb } = await import("@newspoint/db");
    return getDb().$client.unsafe(text, values);
  }, origin);
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
}

export { handle as GET, handle as POST };
