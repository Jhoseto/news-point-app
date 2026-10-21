"use client";

import { useEffect, useMemo } from "react";
import { usePathname } from "next/navigation";
import type { AnalyticsWindow } from "@/lib/cookie-consent-effects";
import { createArticleMeasurement, nextArticleId, type ArticleAnalyticsMeta } from "@/lib/article-analytics";
import { currentCookieConsent, useCookieConsent } from "./cookie-consent-store";

export function ArticleAnalytics({ meta, path, measurementId, targets }: {
  meta: ArticleAnalyticsMeta; path: string; measurementId: string; targets: { path: string; id: string }[];
}) {
  const pathname = usePathname();
  const allowed = useCookieConsent().record?.statistics === true;
  const measurement = useMemo(() => {
    const enabled = () => {
      const tracking = window as AnalyticsWindow;
      return location.pathname === path && currentCookieConsent()?.statistics === true && tracking.__npAnalyticsLoaded?.kind === "ga4"
        && tracking.__npAnalyticsLoaded.measurementId === measurementId && typeof tracking.gtag === "function";
    };
    return createArticleMeasurement(meta, enabled, (event, params) => {
      if (!enabled()) return false;
      (window as AnalyticsWindow).gtag!("event", event, { ...params, send_to: measurementId });
      return true;
    });
  }, [meta.article_id, meta.article_author, meta.article_category, meta.content_kind, path, measurementId, pathname]);

  useEffect(() => {
    if (!allowed) return;
    const root = document.getElementById("np-article-body")?.closest(".np-article-page");
    if (!root) return;
    const candidates = new Map(targets.map(target => [target.path, target.id]));
    const sample = () => measurement.sample({ now: performance.now(), visible: document.visibilityState === "visible",
      body: document.getElementById("np-article-body")?.getBoundingClientRect() ?? null, viewportHeight: window.innerHeight });
    const click = (event: MouseEvent) => {
      if (event.button !== 0 || event.defaultPrevented || !(event.target instanceof Element)) return;
      const anchor = event.target.closest("a[href]");
      if (!anchor || !root.contains(anchor) || anchor.hasAttribute("download")) return;
      const id = nextArticleId(anchor.getAttribute("href") ?? "", location.origin, location.pathname, candidates);
      if (id) measurement.next(id, document.visibilityState === "visible");
    };
    // Polling also handles consent/tag initialization order and lazy media changing body height.
    sample();
    const timer = window.setInterval(sample, 1000);
    document.addEventListener("visibilitychange", sample);
    // Observe before the router's document/root handlers can change location or cancel the event.
    window.addEventListener("click", click, true);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", sample);
      window.removeEventListener("click", click, true);
      measurement.sample({ now: performance.now(), visible: false, body: null, viewportHeight: 0 });
    };
  }, [allowed, measurement, targets]);
  return null;
}
