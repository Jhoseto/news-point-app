"use client";

import { useEffect, useEffectEvent, useRef } from "react";
import { STUDIO_PHONE_QUERY } from "../lib/studio-phone";

/** Contain focus in an open phone sheet and return it to the opener. */
export function usePhoneDialog(open: boolean, onDismiss?: () => void) {
  const layer = useRef<HTMLDivElement>(null);
  const dismiss = useEffectEvent(() => onDismiss?.());
  useEffect(() => {
    const sheet = layer.current;
    if (!open || !sheet) return;
    const phone = window.matchMedia(STUDIO_PHONE_QUERY);
    let restore: (() => void) | undefined;
    function sync() {
      restore?.();
      restore = undefined;
      if (!phone.matches || !sheet) return;
      const opener = document.activeElement;
      const siblings: HTMLElement[] = [];
      for (let node: HTMLElement | null = sheet; node && node !== document.body; node = node.parentElement) {
        for (const sibling of Array.from(node.parentElement?.children ?? [])) {
          if (sibling !== node && sibling instanceof HTMLElement && !sibling.inert) {
            sibling.inert = true;
            siblings.push(sibling);
          }
        }
      }
      const keydown = (event: KeyboardEvent) => { if (event.key === "Escape") dismiss(); };
      sheet.addEventListener("keydown", keydown);
      sheet.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus({ preventScroll: true });
      restore = () => {
        sheet.removeEventListener("keydown", keydown);
        for (const sibling of siblings) sibling.inert = false;
        if (opener instanceof HTMLElement && opener.isConnected) opener.focus({ preventScroll: true });
      };
    }
    sync();
    phone.addEventListener("change", sync);
    return () => { phone.removeEventListener("change", sync); restore?.(); };
  }, [open]);
  return layer;
}
