import type { Metadata } from "next";
import { LivePointPage } from "@/components/livepoint/livepoint-page";
import { WeatherPanel } from "@/components/livepoint/weather-panel";
import { getWeatherForecast } from "@/lib/livepoint/weather/met-norway";

export const metadata: Metadata = {
  title: "Време · LivePoint",
  description: "Прогноза за Пловдив от MET Norway.",
};

export const dynamic = "force-dynamic";

export default async function LivePointWeatherPage() {
  const weather = await getWeatherForecast();
  return (
    <LivePointPage
      title="Времето в Пловдив"
      lead="Данните са от модела на MET Norway, не от местен датчик. Показваме само полетата, които схемата реално връща."
      wide
    >
      <WeatherPanel initial={weather} variant="page" />
    </LivePointPage>
  );
}
