import type { Metadata } from "next";
import { LivePointPage } from "@/components/livepoint/livepoint-page";
import { TrafficPanel } from "@/components/livepoint/traffic-panel";
import { isTomTomConfigured } from "@/lib/livepoint/config";

export const metadata: Metadata = {
  title: "Трафик · LivePoint",
  description: "Карта и инциденти за Пловдив.",
};

export default function LivePointTrafficPage() {
  return (
    <LivePointPage title="Трафик · Пловдив" lead="Карта на движението, събития по вид и подробности за пътната обстановка в района." full>
      <TrafficPanel connected={isTomTomConfigured()} variant="page" cesiumToken={process.env.CESIUM_ION_TOKEN} />
    </LivePointPage>
  );
}
