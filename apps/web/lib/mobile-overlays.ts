"use client";

export const MOBILE_OVERLAY_REQUEST = "np:mobile-overlay-request";
export const MOBILE_OVERLAY_CHANGE = "np:mobile-overlay-change";
export type MobileOverlay = "livepoint" | "latest" | "home" | "search" | "rubrics";

/** Coordinate phone panels, including a cancellable exit from an unfinished form. */
export function requestMobileOverlay(target: MobileOverlay): boolean {
  if (!window.matchMedia("(max-width: 63.999rem)").matches) return true;
  if (!window.dispatchEvent(new CustomEvent<MobileOverlay>(MOBILE_OVERLAY_REQUEST, { detail: target, cancelable: true }))) return false;
  window.dispatchEvent(new CustomEvent<MobileOverlay>(MOBILE_OVERLAY_CHANGE, { detail: target }));
  return true;
}
