import { cityGuideEnabled } from "@/lib/city-guide/access";
import { CityPreviewRefresh } from "@/components/city-guide/city-preview-refresh";

// Freshness and publication decisions are evaluated for every request.
export const dynamic = "force-dynamic";

export default function CityGuideLayout({ children }: { children: React.ReactNode }) {
  return <>{cityGuideEnabled() ? <CityPreviewRefresh /> : null}{children}</>;
}
