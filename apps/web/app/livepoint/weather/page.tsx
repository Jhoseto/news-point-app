import type { Metadata } from "next";
import { LivePointPage } from "@/components/livepoint/livepoint-page";
import { WeatherPanel } from "@/components/livepoint/weather-panel";
import { getWeatherForecast } from "@/lib/livepoint/weather/met-norway";

export const metadata: Metadata = {
  title: "Време · LivePoint",
  description: "Прогноза за Пловдив.",
};

export const dynamic = "force-dynamic";

export default async function LivePointWeatherPage() {
  const weather = await getWeatherForecast();
  return (
    <LivePointPage title="Времето в Пловдив" full compact stickyHeader>
      <WeatherPanel initial={weather} variant="page" />
    </LivePointPage>
  );
}
