import { NextResponse } from "next/server";
import { getLatest24Hours } from "@/lib/queries";

export const dynamic = "force-dynamic";

/** The archive stays anchored while this public, 24-hour sidebar refreshes independently. */
export async function GET() {
  try {
    const articles = await getLatest24Hours(Date.now());
    return NextResponse.json({ articles }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "Latest news unavailable" }, { status: 503, headers: { "Cache-Control": "private, no-store" } });
  }
}
