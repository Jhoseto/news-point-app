"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";

const BottomNav = dynamic(() => import("./nav").then((m) => m.BottomNav), {
  ssr: false,
  loading: () => null,
});

const MobileSearch = dynamic(() => import("./nav").then((m) => m.MobileSearch), {
  ssr: false,
  loading: () => null,
});

const LatestPanel = dynamic(
  () => import("./latest-panel").then((m) => m.LatestPanel),
  { ssr: false, loading: () => null },
);
const MobileRubricPager = dynamic(() => import("./mobile-rubric-pager").then(module => module.MobileRubricPager), { ssr: false, loading: () => null });
const MobilePushPrompt = dynamic(() => import("./mobile-push-prompt").then(module => module.MobilePushPrompt), { ssr: false, loading: () => null });

/**
 * Phone chrome only. Mount after idle so LCP is not charged for bottom nav,
 * search sheet, pager and push prompt JS.
 */
export function MobileChromeIsland() {
  const [ready, setReady] = useState(false);
  const [latestOpen, setLatestOpen] = useState(false);

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

  const openLatest = useCallback(() => setLatestOpen(value => !value), []);
  const closeLatest = useCallback(() => setLatestOpen(false), []);

  if (!ready) return null;
  return (
    <>
      <MobileSearch showHeaderTrigger={false} />
      <BottomNav onOpenLatest={openLatest} latestOpen={latestOpen} onNavigate={closeLatest} />
      <LatestPanel open={latestOpen} onClose={closeLatest} />
      <MobileRubricPager />
      <MobilePushPrompt />
    </>
  );
}
