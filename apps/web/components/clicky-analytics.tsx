"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { flushClickyGoals, logClickyGoal, startClickyExtras } from "@/lib/clicky-track";

type ClickyWindow = Window & {
  clicky?: { log: (href: string, title?: string, type?: string) => void };
  clicky_custom?: { history_disable?: number; getHighEntropyValues?: number };
  __npClickyLoaded?: string;
};

function pageHref(): string {
  return `${window.location.pathname}${window.location.search}`;
}

function installClicky(siteId: string) {
  const tracking = window as ClickyWindow;
  tracking.clicky_custom = tracking.clicky_custom ?? {};
  // Next.js changes the address without a new document. We log those ourselves.
  tracking.clicky_custom.history_disable = 1;
  // Chrome and similar browsers can report the phone model. Safari and Firefox do not offer it.
  tracking.clicky_custom.getHighEntropyValues = 1;
  if (document.getElementById("np-clicky")) return;
  const script = document.createElement("script");
  script.id = "np-clicky";
  script.async = true;
  script.dataset.id = siteId;
  script.src = "https://static.getclicky.com/js";
  script.addEventListener("load", () => { startClickyExtras(); flushClickyGoals(); });
  document.body.appendChild(script);
  tracking.__npClickyLoaded = siteId;
  startClickyExtras();
}

/** Clicky page views, including visits that keep only necessary cookies. The first view is the script's own; later routes are logged here. */
export function ClickyAnalytics({ siteId }: { siteId: string }) {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const logged = useRef<string | null>(null);

  useEffect(() => {
    installClicky(siteId);
    logged.current = pageHref();
  }, [siteId]);

  useEffect(() => {
    const href = `${pathname}${search ? `?${search}` : ""}`;
    const query = new URLSearchParams(search).get("q")?.trim();
    if ((pathname === "/search" || pathname === "/search/") && query) logClickyGoal("Търсене", query);
    startClickyExtras();
    if (!href.startsWith("/") || logged.current === href) return;
    const clicky = (window as ClickyWindow).clicky;
    if (!clicky?.log) return;
    logged.current = href;
    const send = () => clicky.log(href, document.title, "pageview");
    const frame = window.requestAnimationFrame(send);
    return () => window.cancelAnimationFrame(frame);
  }, [pathname, search]);

  return null;
}
