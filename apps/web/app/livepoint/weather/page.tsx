import { publicPageMetadata } from "@/lib/public-metadata";
import { LivePointPage } from "@/components/livepoint/livepoint-page";
import { WeatherPanel } from "@/components/livepoint/weather-panel";
import { getWeatherForecast } from "@/lib/livepoint/weather/met-norway";
import { DEFAULT_WEATHER_CITY, getWeatherCity } from "@/lib/livepoint/weather/cities";
import { notFound } from "next/navigation";

export const metadata = publicPageMetadata("weather");

export const dynamic = "force-dynamic";

export default async function LivePointWeatherPage({ searchParams }: { searchParams: Promise<{ city?: string | string[] }> }) {
  const { city: requestedCity } = await searchParams;
  const city = requestedCity === undefined ? DEFAULT_WEATHER_CITY : typeof requestedCity === "string" ? getWeatherCity(requestedCity) : undefined;
  if (!city) notFound();
  const weather = await getWeatherForecast(city.id);
  return (
    <LivePointPage title="Прогноза за времето" full compact stickyHeader>
      <WeatherPanel initial={weather} {...(requestedCity ? { initialCityId: city.id } : {})} variant="page" />
    </LivePointPage>
  );
}
