import { publicPageMetadata } from "@/lib/public-metadata";
import { LivePointPage } from "@/components/livepoint/livepoint-page";
import { WeatherPanel } from "@/components/livepoint/weather-panel";
import { getWeatherForecast } from "@/lib/livepoint/weather/met-norway";

export const metadata = publicPageMetadata("weather");

export const dynamic = "force-dynamic";

export default async function LivePointWeatherPage() {
  const weather = await getWeatherForecast();
  return (
    <LivePointPage title="Времето в Пловдив" full compact stickyHeader>
      <WeatherPanel initial={weather} variant="page" />
    </LivePointPage>
  );
}
