"use client";

import { useEffect, useRef } from "react";

/**
 * Lazy TomTom map. Loaded only after the user opens the traffic panel and
 * confirms map load. Uses the public SDK script; key comes from a same-origin
 * endpoint that only answers when TomTom is configured.
 */
export function TrafficMap({ className = "" }: { className?: string }) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    let map: { remove?: () => void } | null = null;

    async function boot() {
      const keyRes = await fetch("/api/livepoint/traffic/?mapKey=1", { cache: "no-store" });
      if (!keyRes.ok || cancelled) return;
      const { key, center } = (await keyRes.json()) as {
        key?: string;
        center?: { lat: number; lon: number };
      };
      if (!key || !host.current || cancelled) return;

      await loadScript("https://api.tomtom.com/maps-sdk-for-web/v6/services.min.js");
      await loadScript("https://api.tomtom.com/maps-sdk-for-web/v6/maps.min.js");
      await loadCss("https://api.tomtom.com/maps-sdk-for-web/v6/maps.css");
      if (cancelled || !host.current) return;

      const tt = (window as unknown as { tt?: TomTomGlobal }).tt;
      if (!tt) return;

      map = tt.map({
        key,
        container: host.current,
        center: [center?.lon ?? 24.7453, center?.lat ?? 42.1354],
        zoom: 12,
        stylesVisibility: { trafficFlow: true, trafficIncidents: true },
      });
    }

    void boot();
    return () => {
      cancelled = true;
      map?.remove?.();
    };
  }, []);

  return <div ref={host} className={className} role="presentation" />;
}

type TomTomGlobal = {
  map: (options: Record<string, unknown>) => { remove?: () => void };
};

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
    if (existing) {
      if (existing.dataset.loaded === "1") resolve();
      else existing.addEventListener("load", () => resolve(), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => {
      script.dataset.loaded = "1";
      resolve();
    };
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(script);
  });
}

function loadCss(href: string): Promise<void> {
  return new Promise((resolve) => {
    if (document.querySelector(`link[href="${href}"]`)) {
      resolve();
      return;
    }
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.onload = () => resolve();
    link.onerror = () => resolve();
    document.head.appendChild(link);
  });
}
