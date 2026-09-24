import { NextResponse } from "next/server";
import { getWeatherForecast } from "@/lib/livepoint/weather/met-norway";

export const dynamic = "force-dynamic";

export async function GET() {
  const data = await getWeatherForecast();
  return NextResponse.json(data, {
    headers: {
      "Cache-Control": "private, no-store",
    },
  });
}
