import type { Metadata } from "next";
import { LivePointPage } from "@/components/livepoint/livepoint-page";
import { CamerasPanel } from "@/components/livepoint/cameras-panel";

export const metadata: Metadata = {
  title: "Камери · LivePoint",
  description: "Проверен каталог на публични камери около Пловдив.",
};

export default function LivePointCamerasPage() {
  return (
    <LivePointPage
      title="Камери"
      lead="Ръчно проверен каталог. Първо линк към оригиналната страница. Поток се зарежда само за избраната камера."
    >
      <CamerasPanel />
    </LivePointPage>
  );
}
