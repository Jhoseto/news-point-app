"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Keep an open local pilot page aligned with the latest checked snapshot. */
export function CityPreviewRefresh() {
  const router = useRouter();

  useEffect(() => {
    let lastRefresh = Date.now();
    const refreshIfDue = () => {
      if (document.visibilityState !== "visible" || Date.now() - lastRefresh < 60_000) return;
      lastRefresh = Date.now();
      router.refresh();
    };
    const timer = window.setInterval(refreshIfDue, 60_000);
    document.addEventListener("visibilitychange", refreshIfDue);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshIfDue);
    };
  }, [router]);

  return null;
}
