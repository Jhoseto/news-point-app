import type { ConsentChoices } from "./cookie-consent";
import { RECENT_SEARCH_KEY } from "./recent-searches";
import type { PublicAnalyticsConfig } from "./public-analytics";

export type AnalyticsWindow = Window & {
  dataLayer?: unknown[];
  gtag?: (...args: unknown[]) => void;
  __npAnalyticsLoaded?: PublicAnalyticsConfig;
};

function removeMatching(storage: Storage, prefix: string) {
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i++) { const key = storage.key(i); if (key?.startsWith(prefix)) keys.push(key); }
  for (const key of keys) storage.removeItem(key);
}
function clearGoogleCookies() {
  const names = document.cookie.split(";").map(part => part.trim().split("=")[0]!).filter(name => /^_(ga(?:_|$)|gid$|gat(?:_|$)|gcl_)/.test(name));
  const host = location.hostname;
  const domains = ["", ...host.split(".").map((_, index, parts) => parts.slice(index).join(".")).filter(domain => domain.includes(".")).flatMap(domain => [domain, `.${domain}`])];
  for (const name of names) for (const domain of domains) document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax${domain ? `; Domain=${domain}` : ""}${location.protocol === "https:" ? "; Secure" : ""}`;
}

/** Necessary first-party cleanup only. Never sends a consent ID, form content or analytics event. */
export async function applyCookieChoices(choices: ConsentChoices, signal: AbortSignal): Promise<void> {
  if (!choices.preferences) try { localStorage.removeItem(RECENT_SEARCH_KEY); } catch {}
  if (choices.statistics) return;
  const tracking = window as AnalyticsWindow;
  const loaded = tracking.__npAnalyticsLoaded;
  if (loaded) {
    tracking.gtag?.("consent", "update", { analytics_storage: "denied", ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" });
    if (loaded.kind === "ga4") (window as unknown as Record<string, unknown>)[`ga-disable-${loaded.measurementId}`] = true;
  }
  try { removeMatching(sessionStorage, "np-read:v1:"); } catch {}
  try { clearGoogleCookies(); } catch { /* Browser may disallow all cookie access. */ }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);
  const abort = () => controller.abort();
  signal.addEventListener("abort", abort, { once: true });
  try {
    if (!signal.aborted) await fetch("/api/privacy/clear-statistics/", { method: "POST", credentials: "same-origin", cache: "no-store", signal: controller.signal });
  } catch { /* Tracking stays blocked even when offline; retry cleanup on the next page load. */ }
  finally { clearTimeout(timeout); signal.removeEventListener("abort", abort); }
  // Removing a script element does not stop a running Google/GTM runtime. A fresh document does.
  if (loaded) location.reload();
}
