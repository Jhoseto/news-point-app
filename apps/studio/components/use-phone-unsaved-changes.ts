"use client";

import { useEffect } from "react";
import { STUDIO_PHONE_QUERY } from "../lib/studio-phone";

type GuardOptions = { guardLinks?: boolean; guardUnload?: boolean };
const dirtyForms = new Set<GuardOptions>();
const leaveMessage = "Има незаписани промени. Да напусна ли без запис?";
let confirmedClick = false;

export function confirmPhoneLeave() {
  return !dirtyForms.size || !window.matchMedia(STUDIO_PHONE_QUERY).matches || window.confirm(leaveMessage);
}

function guardLink(event: MouseEvent) {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  if (!window.matchMedia(STUDIO_PHONE_QUERY).matches || !Array.from(dirtyForms).some(form => form.guardLinks)) return;
  const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
  if (!link || link.hasAttribute("download") || (link.target && link.target !== "_self")) return;
  const destination = new URL(link.href);
  if (!["http:", "https:"].includes(destination.protocol)) return;
  if (destination.origin === location.origin && destination.pathname === location.pathname && destination.search === location.search) return;
  if (!confirmPhoneLeave()) {
    event.preventDefault();
    event.stopPropagation();
    return;
  }
  // A normal anchor may also fire beforeunload during this navigation.
  confirmedClick = true;
  window.setTimeout(() => { confirmedClick = false; }, 0);
}

function guardTraversal(event: NavigateEvent) {
  // Same-document Back/Forward can unmount an editor without firing beforeunload.
  if (event.navigationType !== "traverse" || !event.cancelable || !event.destination.sameDocument || !event.destination.url) return;
  const destination = new URL(event.destination.url);
  if (destination.pathname === location.pathname && destination.search === location.search) return;
  if (!confirmPhoneLeave()) event.preventDefault();
}

function handleBeforeUnload(event: BeforeUnloadEvent) {
  if (!confirmedClick && window.matchMedia(STUDIO_PHONE_QUERY).matches && Array.from(dirtyForms).some(form => form.guardUnload)) {
    event.preventDefault();
    event.returnValue = "";
  }
}

export function usePhoneUnsavedChanges(dirty: boolean, { guardLinks = true, guardUnload = true }: GuardOptions = {}) {
  useEffect(() => {
    if (!dirty) return;
    const form = { guardLinks, guardUnload };
    dirtyForms.add(form);
    document.addEventListener("click", guardLink, true);
    window.addEventListener("beforeunload", handleBeforeUnload);
    window.navigation?.addEventListener("navigate", guardTraversal);
    return () => {
      dirtyForms.delete(form);
      if (!dirtyForms.size) {
        document.removeEventListener("click", guardLink, true);
        window.removeEventListener("beforeunload", handleBeforeUnload);
        window.navigation?.removeEventListener("navigate", guardTraversal);
      }
    };
  }, [dirty, guardLinks, guardUnload]);
}
