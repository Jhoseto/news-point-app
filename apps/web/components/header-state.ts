"use client";

/**
 * Single source of truth for which phone-sheet is open. Both MobileSearch and
 * the RubricsNav sheet write here; BottomNav reads it for its active state.
 * The state lives on the <html> element so server-rendered pages hydrate the
 * same way and the bottom bar can react without a JS bundle of its own.
 */

import { useEffect, useState } from "react";

export type HeaderSheet = "search" | "rubrics" | null;

const ATTR = "data-header-sheet";

function read(): HeaderSheet {
  if (typeof document === "undefined") return null;
  const raw = document.documentElement.getAttribute(ATTR);
  return raw === "search" || raw === "rubrics" ? raw : null;
}

export function setHeaderSheet(value: HeaderSheet): void {
  if (typeof document === "undefined") return;
  if (value === null) document.documentElement.removeAttribute(ATTR);
  else document.documentElement.setAttribute(ATTR, value);
}

export function isHeaderSheetOpen(): boolean {
  return read() !== null;
}

export function currentHeaderSheet(): HeaderSheet {
  return read();
}

/** Subscribes to attribute changes on <html> so consumers re-render on open/close. */
export function useHeaderSheet(): HeaderSheet {
  const [value, setValue] = useState<HeaderSheet>(() => read());
  useEffect(() => {
    setValue(read());
    const observer = new MutationObserver(() => setValue(read()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: [ATTR] });
    return () => observer.disconnect();
  }, []);
  return value;
}