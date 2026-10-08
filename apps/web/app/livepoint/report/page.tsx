import { publicPageMetadata } from "@/lib/public-metadata";
import { LivePointPage } from "@/components/livepoint/livepoint-page";
import { ReportPanel } from "@/components/livepoint/report-panel";

export const metadata = publicPageMetadata("report");

export default function LivePointReportPage() {
  return (
    <LivePointPage title="Подай сигнал" lead="Редакцията преглежда всеки сигнал. Публично става само одобрен материал." wide>
      <ReportPanel />
    </LivePointPage>
  );
}
