/** A panel owns its close/history behavior; the mobile back control must not pop twice. */
export const MOBILE_HEADER_BACK_EVENT = "np:mobile-header-back";

const ROOT_ENTRY = "npMobileHistoryRoot";

type MobileHistory = Pick<History, "length" | "state" | "replaceState">;
type MobileBrowser = {
  history: Pick<History, "length" | "state">;
  location: Pick<Location, "href">;
  navigation?: { canGoBack?: boolean };
};

/**
 * Mark only a proven first entry. History.length includes forward entries, so it
 * stays at 2 after a newly opened phone panel is closed with history.back().
 * Preserve all router-owned state and never patch the browser history methods.
 */
export function markMobileHistoryRoot(history: MobileHistory, href: string): void {
  if (history.length !== 1) return;
  const state: unknown = history.state;
  if (state !== null && (typeof state !== "object" || Array.isArray(state))) return;
  try { history.replaceState({ ...state, [ROOT_ENTRY]: href }, ""); }
  catch { /* A restricted browser can still use its ordinary history fallback. */ }
}

/** Prefer the browser's actual position; older iPhones use our known-root hint. */
export function canNavigateMobileBack(browser: MobileBrowser): boolean {
  if (typeof browser.navigation?.canGoBack === "boolean") return browser.navigation.canGoBack;
  if (browser.history.length <= 1) return false;
  const state: unknown = browser.history.state;
  // LivePoint copies state when opening a query panel. Its different URL must
  // not accidentally inherit the root's no-previous-page meaning.
  if (state && typeof state === "object" && ROOT_ENTRY in state
    && state[ROOT_ENTRY] === browser.location.href) return false;
  return true;
}

export type MobileBackState = {
  livePointOpen: boolean;
  latestOpen: boolean;
  headerSheetOpen: boolean;
  historyLength: number;
  canGoBack?: boolean;
};

export type MobileBackActions = {
  closeLivePoint: () => void;
  closeLatest: () => void;
  closeHeaderSheet: () => void;
  back: () => void;
  home: () => void;
};

/**
 * Close the current surface first, preserving its unsaved-text confirmation.
 * A fresh standalone/PWA launch has no previous entry, so use the app's home
 * fallback instead of calling history.back(), which would do nothing there.
 */
export function runMobileBack(state: MobileBackState, actions: MobileBackActions): void {
  if (state.livePointOpen) { actions.closeLivePoint(); return; }
  if (state.latestOpen) { actions.closeLatest(); return; }
  if (state.headerSheetOpen) { actions.closeHeaderSheet(); return; }
  if (state.canGoBack ?? (state.historyLength > 1)) actions.back();
  else actions.home();
}
