import { publicPageMetadata } from "@/lib/public-metadata";
import { LivePointPage } from "@/components/livepoint/livepoint-page";
import { MyNewsPanel } from "@/components/livepoint/my-news-panel";

export const metadata = publicPageMetadata("myNews");

export default function LivePointMyNewsPage() {
  return (
    <LivePointPage title="Моята новина" lead="Отделен вход от „Подай сигнал“. Няма автоматично публикуване." wide>
      <MyNewsPanel />
    </LivePointPage>
  );
}
