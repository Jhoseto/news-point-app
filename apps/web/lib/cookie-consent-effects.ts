import type { ConsentChoices } from "./cookie-consent";
import { RECENT_SEARCH_KEY } from "./recent-searches";
import type { PublicAnalyticsConfig } from "./public-analytics";

export type AnalyticsWindow = Window & {
  dataLayer?: unknown[];
  gtag?: (...args: unknown[]) => void;
  __npAnalyticsLoaded?: PublicAnalyticsConfig;
  __npClickyLoaded?: string;
};

function removeMatching(storage: Storage, prefix: string) {
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i++) { const key = storage.key(i); if (key?.startsWith(prefix)) keys.push(key); }
  for (const key of keys) storage.removeItem(key);
}
/** Necessary first-party cleanup only. Never sends a consent ID, form content or analytics event. Clicky and Google Analytics stay loaded. */
export async function applyCookieChoices(choices: ConsentChoices, signal: AbortSignal): Promise<void> {
  if (!choices.preferences) try { localStorage.removeItem(RECENT_SEARCH_KEY); } catch {}
  if (choices.statistics) return;
  try { removeMatching(sessionStorage, "np-read:v1:"); } catch {}
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);
  const abort = () => controller.abort();
  signal.addEventListener("abort", abort, { once: true });
  try {
    if (!signal.aborted) await fetch("/api/privacy/clear-statistics/", { method: "POST", credentials: "same-origin", cache: "no-store", signal: controller.signal });
  } catch { /* The read counter stays off even when offline. */ }
  finally { clearTimeout(timeout); signal.removeEventListener("abort", abort); }
}
