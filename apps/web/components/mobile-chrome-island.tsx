"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { MOBILE_OVERLAY_CHANGE, type MobileOverlay } from "@/lib/mobile-overlays";
const CityMobileDock = dynamic(() => import("./city-guide/city-mobile-dock").then(m => m.CityMobileDock), { ssr: false });

const BottomNav = dynamic(() => import("./nav").then((m) => m.BottomNav), {
  ssr: false,
  loading: () => null,
});

const MobileSearch = dynamic(() => import("./nav").then((m) => m.MobileSearch), {
  ssr: false,
  loading: () => null,
});

const MobileRubricsSheet = dynamic(() => import("./nav").then((m) => m.MobileRubricsSheet), {
  ssr: false,
  loading: () => null,
});

const LatestPanel = dynamic(
  () => import("./latest-panel").then((m) => m.LatestPanel),
  { ssr: false, loading: () => null },
);
const MobileRubricPager = dynamic(() => import("./mobile-rubric-pager").then(module => module.MobileRubricPager), { ssr: false, loading: () => null });
const MobilePushPrompt = dynamic(() => import("./mobile-push-prompt").then(module => module.MobilePushPrompt), { ssr: false, loading: () => null });

export type MobileRubricItem = { slug: string; name: string; path: string };

/**
 * Phone chrome only. Mount after idle so LCP is not charged for bottom nav,
 * search sheet, pager and push prompt JS.
 */
export function MobileChromeIsland({ rubrics, cityEnabled = false }: { rubrics: MobileRubricItem[]; cityEnabled?: boolean }) {
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  const [latestOpen, setLatestOpen] = useState(false);
  const [latestMounted, setLatestMounted] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 63.999rem)");
    let cancelled = false;
    let idleId = 0;
    let timeoutId = 0;

    const arm = () => {
      if (cancelled || !media.matches) return;
      setReady(true);
    };
    const onChange = () => {
      if (!media.matches) {
        setReady(false);
        setLatestOpen(false);
        return;
      }
      arm();
    };

    if (media.matches) {
      if (typeof window.requestIdleCallback === "function") {
        idleId = window.requestIdleCallback(arm, { timeout: 2000 });
      } else {
        timeoutId = window.setTimeout(arm, 1);
      }
    }
    media.addEventListener("change", onChange);
    return () => {
      cancelled = true;
      if (idleId && typeof window.cancelIdleCallback === "function") window.cancelIdleCallback(idleId);
      if (timeoutId) window.clearTimeout(timeoutId);
      media.removeEventListener("change", onChange);
    };
  }, []);

  const openLatest = useCallback(() => {
    // Fetch the sheet only when it is first requested. Keep it mounted after
    // closing so its exit animation and the reader's list position survive.
    setLatestMounted(true);
    setLatestOpen(value => !value);
  }, []);
  const closeLatest = useCallback(() => setLatestOpen(false), []);

  useEffect(() => {
    // A reader can select another sheet while the first LatestPanel chunk is
    // still loading. Observe switches here so that late import cannot reopen it.
    if (!ready) return;
    const switchPanel = (event: Event) => {
      if ((event as CustomEvent<MobileOverlay>).detail !== "latest" && !event.defaultPrevented) closeLatest();
    };
    window.addEventListener(MOBILE_OVERLAY_CHANGE, switchPanel);
    window.addEventListener("np:search", closeLatest);
    window.addEventListener("np:rubrics", closeLatest);
    return () => {
      window.removeEventListener(MOBILE_OVERLAY_CHANGE, switchPanel);
      window.removeEventListener("np:search", closeLatest);
      window.removeEventListener("np:rubrics", closeLatest);
    };
  }, [ready, closeLatest]);

  if (!ready) return null;
  if (cityEnabled && (pathname === "/moyat-plovdiv" || pathname.startsWith("/moyat-plovdiv/"))) return <><MobileSearch showHeaderTrigger={false} /><MobileRubricsSheet items={rubrics} /><CityMobileDock /></>;
  return (
    <>
      <MobileSearch showHeaderTrigger={false} />
      <MobileRubricsSheet items={rubrics} />
      <BottomNav onOpenLatest={openLatest} latestOpen={latestOpen} onNavigate={closeLatest} />
      {latestMounted ? <LatestPanel open={latestOpen} onClose={closeLatest} /> : null}
      <MobileRubricPager />
      <MobilePushPrompt />
    </>
  );
}
