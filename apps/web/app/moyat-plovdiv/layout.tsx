import { cityGuideEnabled } from "@/lib/city-guide/access";
import { CityPreviewRefresh } from "@/components/city-guide/city-preview-refresh";

export default function CityGuideLayout({ children }: { children: React.ReactNode }) {
  return <>{cityGuideEnabled() ? <CityPreviewRefresh /> : null}{children}</>;
}
