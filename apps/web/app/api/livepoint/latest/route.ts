import { NextResponse } from "next/server";
import { toLatestHeadline } from "@/lib/livepoint/serialize";
import { getLatest } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [article] = await getLatest(1);
    return NextResponse.json(
      { latest: toLatestHeadline(article) },
      { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" } },
    );
  } catch {
    return NextResponse.json({ latest: null }, { status: 200 });
  }
}
