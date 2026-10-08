import { publicPageMetadata } from "@/lib/public-metadata";
import { LivePointPage } from "@/components/livepoint/livepoint-page";
import { TrafficPanel } from "@/components/livepoint/traffic-panel";
import { isTomTomConfigured } from "@/lib/livepoint/config";

export const metadata = publicPageMetadata("traffic");

export default function LivePointTrafficPage() {
  return (
    <LivePointPage title="Трафик · Пловдив" lead="Карта на движението, събития по вид и подробности за пътната обстановка в района." full>
      <TrafficPanel connected={isTomTomConfigured()} variant="page" cesiumToken={process.env.CESIUM_ION_TOKEN} />
    </LivePointPage>
  );
}
