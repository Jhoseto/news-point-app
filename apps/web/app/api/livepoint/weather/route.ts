import { NextResponse } from "next/server";
import { getWeatherForecast } from "@/lib/livepoint/weather/met-norway";

export const dynamic = "force-dynamic";

// met.no updates roughly every 2 hours; 60 s CDN cache is a safe floor that
// keeps the origin well below the met.no rate limit. Data is identical for
// every visitor, so private/no-store was wasted bandwidth.
export async function GET() {
  const data = await getWeatherForecast();
  return NextResponse.json(data, {
    headers: {
      "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
    },
  });
}
