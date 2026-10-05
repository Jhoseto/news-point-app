import { NextResponse } from "next/server";
import { searchPublicArticlesForTheme } from "@/lib/story-themes";
import { requireStaff } from "@/lib/session";

export const dynamic = "force-dynamic";

/** GET /api/stories/search-articles?q=&limit= — public articles for picker. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const q = url.searchParams.get("q") ?? "";
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit") ?? 20) || 20));
  const staff = await requireStaff();
  const articles = await searchPublicArticlesForTheme(staff, q, limit);
  return NextResponse.json(
    { articles },
    { headers: { "cache-control": "no-store" } },
  );
}
