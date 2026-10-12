"use client";

import { startTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createPlacementRefresh } from "@/lib/placement-refresh";

/** Placement windows expire independently of article/SSE events. */
export function PlacementRefresh({ nextChangeAt }: { nextChangeAt: number | null }) {
  const router = useRouter();
  useEffect(() => {
    if (nextChangeAt === null) return;
    const scheduler = createPlacementRefresh(nextChangeAt, () => {
      window.dispatchEvent(new Event("np:public-content-updated"));
      startTransition(() => router.refresh());
    }, () => document.hidden);
    document.addEventListener("visibilitychange", scheduler.check);
    window.addEventListener("pageshow", scheduler.check);
    return () => {
      scheduler.cancel();
      document.removeEventListener("visibilitychange", scheduler.check);
      window.removeEventListener("pageshow", scheduler.check);
    };
  }, [nextChangeAt, router]);
  return null;
}
