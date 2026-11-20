import { NextResponse } from "next/server";
import { getWeatherForecast } from "../../../../lib/livepoint/weather/met-norway";
import { DEFAULT_WEATHER_CITY, getWeatherCity } from "../../../../lib/livepoint/weather/cities";

export const dynamic = "force-dynamic";

// Public data varies only by the city query, never by visitor cookies or location.
export async function GET(request: Request) {
  const cityValues = new URL(request.url).searchParams.getAll("city");
  const cityId = cityValues[0] ?? DEFAULT_WEATHER_CITY.id;
  if (cityValues.length > 1 || !getWeatherCity(cityId)) {
    return NextResponse.json({ error: { code: "INVALID_CITY", message: "Изберете град от списъка." } }, {
      status: 400,
      headers: { "Cache-Control": "no-store" },
    });
  }
  const data = await getWeatherForecast(cityId);
  return NextResponse.json(data, {
    headers: {
      "Cache-Control": data.payload ? "public, s-maxage=60, stale-while-revalidate=120" : "no-store",
    },
  });
}
