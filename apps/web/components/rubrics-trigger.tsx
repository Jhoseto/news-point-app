"use client";

import { requestMobileOverlay } from "@/lib/mobile-overlays";
import { MenuIcon } from "./icons";

export const RUBRICS_EVENT = "np:rubrics";

/** Open the mobile rubrics sheet (header button + programmatic callers). */
export function openRubrics() {
  if (!requestMobileOverlay("rubrics")) return;
  window.dispatchEvent(new CustomEvent(RUBRICS_EVENT));
}

/** Phone and tablet header button; desktop uses the rail. */
export function RubricsButton() {
  return (
    <button
      type="button"
      onClick={openRubrics}
      data-rubrics-trigger
      aria-label="Рубрики"
      className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-ink hover:bg-surface-2 lg:hidden"
    >
      <MenuIcon width={24} height={24} strokeWidth={2.1} />
    </button>
  );
}
