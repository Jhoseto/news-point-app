import type { Metadata } from "next";
import { LivePointPage } from "@/components/livepoint/livepoint-page";
import { MyNewsPanel } from "@/components/livepoint/my-news-panel";

export const metadata: Metadata = {
  title: "Моята новина · LivePoint",
  description: "Изпратете авторски материал към редакцията.",
};

export default function LivePointMyNewsPage() {
  return (
    <LivePointPage title="Моята новина" lead="Отделен вход от „Подай сигнал“. Няма автоматично публикуване." wide>
      <MyNewsPanel onDirtyChange={() => {}} />
    </LivePointPage>
  );
}
