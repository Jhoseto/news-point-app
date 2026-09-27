import type { Metadata } from "next";
import { LivePointPage } from "@/components/livepoint/livepoint-page";
import { CamerasPanel } from "@/components/livepoint/cameras-panel";

export const metadata: Metadata = {
  title: "Камери · LivePoint",
  description: "Проверен каталог на публични камери около Пловдив.",
};

export default function LivePointCamerasPage() {
  return (
    <LivePointPage title="Камери · Пловдив" full compact>
      <CamerasPanel />
    </LivePointPage>
  );
}
