"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";

const BottomNav = dynamic(() => import("./nav").then((m) => m.BottomNav), {
  ssr: false,
  loading: () => null,
});

const LatestPanel = dynamic(
  () => import("./latest-panel").then((m) => m.LatestPanel),
  { ssr: false, loading: () => null },
);
const MobileRubricPager = dynamic(() => import("./mobile-rubric-pager").then(module => module.MobileRubricPager), { ssr: false, loading: () => null });

export function MobileChromeIsland() {
  // Start as `false` so the server-rendered tree matches the desktop client
  // tree. The mobile case is reconciled on mount via matchMedia. The brief
  // period before the effect runs renders the desktop layout, which already
  // matches the desktop server output.
  const [isMobile, setIsMobile] = useState(false);
  const [latestOpen, setLatestOpen] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 63.999rem)");
    const update = () => {
      setIsMobile(media.matches);
      if (!media.matches) setLatestOpen(false);
    };
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  const openLatest = useCallback(() => setLatestOpen(value => !value), []);
  const closeLatest = useCallback(() => setLatestOpen(false), []);

  if (!isMobile) return null;
  return (
    <>
      <BottomNav onOpenLatest={openLatest} latestOpen={latestOpen} onNavigate={closeLatest} />
      <LatestPanel open={latestOpen} onClose={closeLatest} />
      <MobileRubricPager />
    </>
  );
}
