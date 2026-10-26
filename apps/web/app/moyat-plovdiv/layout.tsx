import { CityPreviewRefresh } from "@/components/city-guide/city-preview-refresh";

export default function CityGuideLayout({ children }: { children: React.ReactNode }) {
  return <>{process.env.NODE_ENV === "development" ? <CityPreviewRefresh /> : null}{children}</>;
}
