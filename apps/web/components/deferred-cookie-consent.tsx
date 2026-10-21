"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { afterCriticalPageLoad } from "@/lib/deferred-page-work";

const CookieConsent = dynamic(() => import("./cookie-consent").then((module) => module.CookieConsent), { ssr: false });

/** Banner + settings UI after LCP; consent store initializes with the chunk. */
export function DeferredCookieConsent() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    return afterCriticalPageLoad(() => setReady(true), 800, { skipConstrained: false });
  }, []);
  return ready ? <CookieConsent /> : null;
}
