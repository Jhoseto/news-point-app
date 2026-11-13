"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { STUDIO_PHONE_QUERY } from "../lib/studio-phone";

export function useMobileDeskNavigation() {
  const [pane, setPane] = useState<"list" | "detail">("list");
  const opener = useRef<HTMLElement | null>(null);
  const listControl = useRef<HTMLElement | null>(null);
  const back = useRef<HTMLButtonElement>(null);

  useLayoutEffect(() => {
    if (!opener.current || !window.matchMedia(STUDIO_PHONE_QUERY).matches) return;
    if (pane === "detail") {
      back.current?.focus({ preventScroll: true });
      back.current?.scrollIntoView({ block: "start" });
      return;
    }
    const target = opener.current.isConnected && opener.current.getClientRects().length
      ? opener.current : listControl.current;
    target?.focus({ preventScroll: true });
    target?.scrollIntoView({ block: "nearest" });
  }, [pane]);

  function showDetail(trigger: HTMLElement) {
    if (!window.matchMedia(STUDIO_PHONE_QUERY).matches) return;
    opener.current = trigger;
    listControl.current = trigger.closest("[data-mobile-pane]")?.querySelector<HTMLElement>('input[type="search"], .city-admin-filters input:not([type="checkbox"]), aside button') ?? null;
    setPane("detail");
  }

  function showList() {
    if (!window.matchMedia(STUDIO_PHONE_QUERY).matches) return;
    setPane("list");
  }

  function backButton(label: string, disabled = false) {
    return <button data-mobile-control="" ref={back} type="button" disabled={disabled} className="np-mobile-desk-back" onClick={showList}>
      <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m14 6-6 6 6 6"/></svg>
      {label}
    </button>;
  }

  return { pane, showDetail, showList, backButton };
}
