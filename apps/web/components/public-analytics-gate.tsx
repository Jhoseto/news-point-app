import { PublicAnalytics } from "@/components/public-analytics";
import { publicAnalyticsEnabled, readPublicAnalyticsConfig } from "@/lib/public-analytics";

export function PublicAnalyticsGate() {
  if (!publicAnalyticsEnabled()) return null;
  const config = readPublicAnalyticsConfig();
  if (!config) return null;
  return <PublicAnalytics config={config} />;
}
