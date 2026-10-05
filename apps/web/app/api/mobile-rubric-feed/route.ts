import { NextResponse } from "next/server";
import { canonicalRubricPath } from "@/lib/mobile-rubric-nav";
import { loadMobileRubricFeed } from "@/lib/mobile-rubric-feed-server";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const input = params.get("path");
  const path = input && input.length <= 240 ? canonicalRubricPath(input) : null;
  const fail = (status: number) => NextResponse.json({ error: status === 503 ? "Новините временно не могат да се заредят." : "Невалидна рубрика." }, { status, headers: { "Cache-Control": "no-store" } });
  if (!path || params.getAll("path").length !== 1 || [...params.keys()].some(key => key !== "path")) return fail(400);
  try {
    const feed = await loadMobileRubricFeed(path);
    if (!feed) return fail(404);
    // Shared public view cache is the authority, including minute-bounded editorial placements.
    const age = Math.max(0, Math.min(60, Math.floor((feed.freshUntil - Date.now()) / 1000)));
    return NextResponse.json(feed, { headers: { "Cache-Control": `public, max-age=${age}`, "X-Content-Type-Options": "nosniff" } });
  } catch (error) {
    console.error("[mobile-rubric-feed] public snapshot unavailable", error instanceof Error ? error.message : "unknown");
    return fail(503);
  }
}
