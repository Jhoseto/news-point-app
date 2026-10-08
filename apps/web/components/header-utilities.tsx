"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

const ThemeToggle = dynamic(() => import("./theme").then((m) => m.ThemeToggle), {
  ssr: false,
  loading: () => <span className="inline-flex h-11 w-14 shrink-0" aria-hidden="true" />,
});
const SettingsModal = dynamic(() => import("./settings-modal").then((m) => m.SettingsModal), {
  ssr: false,
  loading: () => <span className="inline-flex size-8 shrink-0" aria-hidden="true" />,
});

/**
 * Theme + settings are not needed for LCP. Mount after idle with size-matched
 * placeholders so the header does not shift (CLS).
 */
export function HeaderUtilities() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const arm = () => {
      if (!cancelled) setReady(true);
    };
    if (typeof window.requestIdleCallback === "function") {
      const idleId = window.requestIdleCallback(arm, { timeout: 1800 });
      return () => {
        cancelled = true;
        window.cancelIdleCallback(idleId);
      };
    }
    const timeoutId = window.setTimeout(arm, 1);
    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, []);

  if (!ready) {
    return (
      <div className="flex shrink-0 items-center gap-1.5" aria-hidden="true">
        <span className="inline-flex h-11 w-14 shrink-0" />
        <span className="inline-flex size-8 shrink-0" />
      </div>
    );
  }

  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <ThemeToggle />
      <SettingsModal />
    </div>
  );
}
