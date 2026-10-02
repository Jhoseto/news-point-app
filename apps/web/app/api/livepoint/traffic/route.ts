import { NextResponse, type NextRequest } from "next/server";
import { isTomTomConfigured, PLOVDIV } from "@/lib/livepoint/config";
import { getTrafficIncidents, getTomTomQuota, tomtomBrowserKey, trafficConnectionStatus } from "@/lib/livepoint/traffic/tomtom";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!isTomTomConfigured()) {
    return NextResponse.json(trafficConnectionStatus(), { status: 200 });
  }

  if (request.nextUrl.searchParams.get("mapKey") === "1") {
    const key = tomtomBrowserKey();
    if (!key) {
      return NextResponse.json({ error: "not_connected" }, { status: 404 });
    }
    return NextResponse.json(
      { key, center: { lat: PLOVDIV.lat, lon: PLOVDIV.lon }, quota: getTomTomQuota() },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  }

  const data = await getTrafficIncidents();
  return NextResponse.json(
    { ...data, quota: getTomTomQuota() },
    {
      headers: {
        // TomTom Free tier caps at 5 req/s. 60 s CDN cache keeps the origin
        // well below that even with a fully cached miss. SWR covers the rare
        // case where TomTom returns nothing while a stale copy is still valid.
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
      },
    },
  );
}
