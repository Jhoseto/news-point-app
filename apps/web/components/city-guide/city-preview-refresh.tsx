"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Keep a visible city page aligned with updated data and new published articles. */
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
