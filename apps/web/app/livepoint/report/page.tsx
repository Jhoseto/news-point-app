import type { Metadata } from "next";
import { LivePointPage } from "@/components/livepoint/livepoint-page";
import { ReportPanel } from "@/components/livepoint/report-panel";

export const metadata: Metadata = {
  title: "Подай сигнал · LivePoint",
  description: "Сигнал към редакцията на NewsPoint.",
};

export default function LivePointReportPage() {
  return (
    <LivePointPage title="Подай сигнал" lead="Редакцията преглежда всеки сигнал. Публично става само одобрен материал." wide>
      <ReportPanel onDirtyChange={() => {}} />
    </LivePointPage>
  );
}
