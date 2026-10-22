import { Suspense } from "react";
import { ClickyAnalytics } from "@/components/clicky-analytics";
import { clickyEnabled, readClickySiteId } from "@/lib/public-analytics";

export function ClickyAnalyticsGate() {
  if (!clickyEnabled()) return null;
  const siteId = readClickySiteId();
  if (!siteId) return null;
  return (
    <Suspense fallback={null}>
      <ClickyAnalytics siteId={siteId} />
    </Suspense>
  );
}
