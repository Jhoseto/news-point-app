import { publicPageMetadata } from "@/lib/public-metadata";
import { LivePointPage } from "@/components/livepoint/livepoint-page";
import { CamerasPanel } from "@/components/livepoint/cameras-panel";

export const metadata = publicPageMetadata("cameras");

export default function LivePointCamerasPage() {
  return (
    <LivePointPage title="Камери · Пловдив" full compact>
      <CamerasPanel />
    </LivePointPage>
  );
}
