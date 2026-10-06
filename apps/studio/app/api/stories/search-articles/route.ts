import { NextResponse } from "next/server";
import { searchPublicArticlesForTheme } from "@/lib/story-themes";
import { requireStaff } from "@/lib/session";

export const dynamic = "force-dynamic";

/** GET /api/stories/search-articles?q=&limit=&offset= — public articles for picker. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const q = url.searchParams.get("q") ?? "";
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") ?? 50) || 50));
  const offset = Math.max(0, Number(url.searchParams.get("offset") ?? 0) || 0);
  const staff = await requireStaff();
  const { articles, hasMore } = await searchPublicArticlesForTheme(staff, q, limit, offset);
  return NextResponse.json(
    { articles, hasMore },
    { headers: { "cache-control": "no-store" } },
  );
}
