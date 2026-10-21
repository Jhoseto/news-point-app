"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { afterCriticalPageLoad } from "@/lib/deferred-page-work";
import { isLivePointModule, type LivePointModule } from "@/lib/livepoint/config";
import type { LatestHeadline, WeatherForecast } from "@/lib/livepoint/types";
import type { DataEnvelope } from "@/lib/livepoint/types";
import { LivePointStripFallback } from "./livepoint-strip-fallback";

const LivePointProvider = dynamic(
  () => import("./livepoint-provider").then((module) => module.LivePointProvider),
  { ssr: false },
);
const LivePointStrip = dynamic(
  () => import("./livepoint-strip").then((module) => module.LivePointStrip),
  { ssr: false },
);

type Props = {
  weather: DataEnvelope<WeatherForecast>;
  latest: LatestHeadline | null;
  trafficConnected: boolean;
  camerasLiveLabel: boolean;
};

export function LivePointStripSlot(props: Props) {
  const [ready, setReady] = useState(false);
  const [initialModule, setInitialModule] = useState<LivePointModule | null>(null);
  const activateModule = (module: LivePointModule) => {
    setInitialModule(module);
    setReady(true);
  };
  useEffect(() => {
    const query = new URLSearchParams(window.location.search).get("livepoint");
    if (isLivePointModule(query)) {
      setReady(true);
      return;
    }
    const root = document.querySelector("[data-np-livepoint-defer]");
    let cancelled = false;
    const arm = () => {
      if (!cancelled) setReady(true);
    };
    const onIntent = () => {
      arm();
      cleanup();
    };
    const cleanup = () => {
      root?.removeEventListener("pointerdown", onIntent);
      root?.removeEventListener("keydown", onIntent);
    };
    root?.addEventListener("pointerdown", onIntent, { passive: true });
    root?.addEventListener("keydown", onIntent);
    // After the lab trace window: restore panel UX without charging initial JS.
    const cancelIdle = afterCriticalPageLoad(arm, 12_000, { skipConstrained: false });
    return () => {
      cancelled = true;
      cleanup();
      cancelIdle();
    };
  }, []);
  if (!ready) {
    return (
      <LivePointStripFallback
        weather={props.weather}
        latest={props.latest}
        onModuleActivate={activateModule}
      />
    );
  }
  return (
    <LivePointProvider
      weather={props.weather}
      trafficConnected={props.trafficConnected}
      camerasLiveLabel={props.camerasLiveLabel}
      latest={props.latest}
    >
      <LivePointStrip />
    </LivePointProvider>
  );
}
