"use client";

import { useEffect } from "react";
import type { PublicAnalyticsConfig } from "@/lib/public-analytics";
import type { AnalyticsWindow } from "@/lib/cookie-consent-effects";
import { currentCookieConsent, useCookieConsent } from "./cookie-consent-store";

/** Basic consent mode: no Google script, iframe or cookieless ping before an affirmative choice. */
export function PublicAnalytics({ config }: { config: PublicAnalyticsConfig }) {
  const allowed = useCookieConsent().record?.statistics === true;
  useEffect(() => {
    if (!allowed || !currentCookieConsent()?.statistics) return;
    const tracking = window as AnalyticsWindow;
    if (tracking.__npAnalyticsLoaded) return;
    tracking.__npAnalyticsLoaded = config;
    const layer = tracking.dataLayer ??= [];
    tracking.gtag ??= function () { layer.push(arguments); };
    tracking.gtag("consent", "default", { analytics_storage: "granted", ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" });
    const script = document.createElement("script");
    script.id = "np-consented-analytics"; script.async = true;
    if (config.kind === "gtm") {
      // Container contents must independently respect these settings; see release checks in PLAN.
      layer.push({ "gtm.start": Date.now(), event: "gtm.js" });
      script.src = `https://www.googletagmanager.com/gtm.js?id=${config.containerId}`;
    } else {
      tracking.gtag("js", new Date());
      tracking.gtag("config", config.measurementId, { allow_google_signals: false, allow_ad_personalization_signals: false });
      script.src = `https://www.googletagmanager.com/gtag/js?id=${config.measurementId}`;
    }
    document.head.appendChild(script);
    // StrictMode must not reinitialize the runtime. The root controller handles revocation.
  }, [allowed, config]);
  return null;
}
